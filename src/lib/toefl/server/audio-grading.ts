// Speaking 채점. docs/toefl-spec.md §12.
// STT를 별도로 안 두고 Gemini에 녹음 오디오를 그대로 넣는다(D3/D4 결정사항 — 이 프로젝트는
// Claude/Whisper 계약이 없어 처음부터 Gemini만 씀, toefl-subsystem-plan 메모 참고).
// Gemini는 오디오를 inline_data로 직접 받을 수 있다(기존 generate-solution.ts가 이미지에 쓰는
// 방식과 동일한 메커니즘).

import { z } from "zod";
import { callGemini } from "@/lib/gemini-server";
import { scoreItem } from "../scoring";
import type { InterviewRubricScore } from "../types";

// ai-grading.ts와 같은 이유(2026-08-27 교차검증 A5·A4)로 zod 검증 + overall_band 하한 0.
const interviewRubricSchema = z.object({
  delivery: z.number().min(0).max(5),
  language_use: z.number().min(0).max(5),
  topic_development: z.number().min(0).max(5),
  overall_band: z.number().min(0).max(6),
  feedback_ko: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
});

export type TranscribeResult = { ok: true; transcript: string } | { ok: false; message: string };

// listen_and_repeat: STT만 하고, 정확도 계산은 이미 검증된 scoreItem()의 wordAccuracy 로직을
// 그대로 재사용한다(중복 구현 금지) — 여기서 다시 채점 규칙을 만들지 않는다.
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<TranscribeResult> {
  const res = await callGemini(
    [
      {
        text: "Transcribe the following spoken English audio exactly as spoken, word for word. Output ONLY the transcript text in plain English, with no quotes, labels, or extra commentary.",
      },
      { inline_data: { mime_type: mimeType, data: audioBase64 } },
    ],
    { temperature: 0 }
  );
  if (!res.ok) return { ok: false, message: `Gemini STT 실패(${res.status}): ${res.message}` };
  return { ok: true, transcript: res.text.trim() };
}

// listen_and_repeat 최종 채점: STT 결과를 기존 scoreItem에 그대로 넘긴다.
export function scoreListenAndRepeatFromTranscript(
  targetSentence: string,
  points: number,
  transcript: string
): { isCorrect: boolean | null; pointsEarned: number } {
  return scoreItem(
    { task_type: "listen_and_repeat", scoring_mode: "auto_transcript", points, answer_key: { target_sentence: targetSentence } },
    { answer: null, transcript }
  );
}

export type InterviewGradeResult = { ok: true; rubric: InterviewRubricScore } | { ok: false; message: string };

const MAX_PARSE_ATTEMPTS = 2;

// take_an_interview: STT 없이 오디오를 그대로 Gemini에 넣고 3지표(Delivery/Language Use/
// Topic Development) 루브릭을 바로 받는다. STT 정확도가 발음 평가를 대체할 수 없다는 §12
// 주의사항대로, Delivery는 어차피 "참고용"이라 명시하고 학생 화면에도 그렇게 표시한다.
export async function gradeInterviewAudio(params: {
  audioBase64: string;
  mimeType: string;
  question: string;
  turnType: string;
}): Promise<InterviewGradeResult> {
  const promptText = `당신은 TOEFL Speaking 채점관입니다. 아래는 학생이 인터뷰 질문에 답한 음성입니다.
질문 유형: ${params.turnType}
질문: ${params.question}

이 음성을 듣고 3개 지표(각 0~5점)로 채점하세요:
delivery(발음·억양·말하기 속도), language_use(문법·어휘 정확성), topic_development(내용 전개·논리성).
overall_band는 0~6 사이 TOEFL 밴드 점수(0.5 단위)입니다.
feedback_ko는 한국어로 한두 문단, strengths/improvements는 한국어 짧은 문장 배열입니다.
무음이거나 질문과 완전히 무관한 답변이면 모든 점수를 0으로 주세요.

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{"delivery":0,"language_use":0,"topic_development":0,"overall_band":0,"feedback_ko":"","strengths":[],"improvements":[]}`;

  let lastMessage = "";
  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    const res = await callGemini(
      [{ text: promptText }, { inline_data: { mime_type: params.mimeType, data: params.audioBase64 } }],
      { temperature: 0.3, json: true }
    );
    if (!res.ok) {
      lastMessage = `Gemini 호출 실패(${res.status}): ${res.message}`;
      continue;
    }
    const parsed = parseInterviewRubric(res.text);
    if (parsed) return { ok: true, rubric: parsed };
    lastMessage = `AI 응답 JSON 파싱 실패: ${res.text.slice(0, 300)}`;
  }

  return { ok: false, message: lastMessage || "알 수 없는 오류" };
}

function parseInterviewRubric(text: string): InterviewRubricScore | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = interviewRubricSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
