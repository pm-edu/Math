// Writing AI 루브릭 채점. docs/toefl-spec.md §12.
// 지시서는 "Claude 호출"을 가정하지만 이 프로젝트는 Claude API 계약이 없어 Gemini로 통일하기로
// 확정했다(toefl-subsystem-plan 메모, P0 결정사항과 동일). src/lib/gemini-server.ts의 callGemini를
// 그대로 재사용(503/429 재시도는 이미 내장) — JSON 파싱 실패(형식 오류)는 별도로 최대 2회 재시도한다.

import { callGemini } from "@/lib/gemini-server";
import type { AcademicDiscussionPayload, WriteAnEmailPayload, WritingRubricScore } from "../types";

const MAX_PARSE_ATTEMPTS = 2;

export type GradeResult = { ok: true; rubric: WritingRubricScore } | { ok: false; message: string };

export async function gradeWritingResponse(params: {
  taskType: "write_an_email" | "academic_discussion";
  prompt: string;
  payload: WriteAnEmailPayload | AcademicDiscussionPayload;
  responseText: string;
}): Promise<GradeResult> {
  const promptText = buildPrompt(params);

  let lastMessage = "";
  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    const res = await callGemini([{ text: promptText }], { temperature: 0.3, json: true });
    if (!res.ok) {
      lastMessage = `Gemini 호출 실패(${res.status}): ${res.message}`;
      continue;
    }
    const parsed = parseRubric(res.text);
    if (parsed) return { ok: true, rubric: parsed };
    lastMessage = `AI 응답 JSON 파싱 실패: ${res.text.slice(0, 300)}`;
  }

  return { ok: false, message: lastMessage || "알 수 없는 오류" };
}

function buildPrompt(params: {
  taskType: "write_an_email" | "academic_discussion";
  prompt: string;
  payload: WriteAnEmailPayload | AcademicDiscussionPayload;
  responseText: string;
}): string {
  const { taskType, prompt, payload, responseText } = params;

  const context =
    taskType === "write_an_email"
      ? (() => {
          const p = payload as WriteAnEmailPayload;
          return `과제: 이메일 작성\n상황: ${p.scenario}\n반드시 포함해야 할 내용: ${p.required_points.join(", ")}\n분량: ${p.word_min}~${p.word_max}단어`;
        })()
      : (() => {
          const p = payload as AcademicDiscussionPayload;
          const posts = p.student_posts.map((s) => `- ${s.name}: ${s.text}`).join("\n");
          return `과제: 학술 토론 게시판 응답\n교수 질문: ${p.professor_post}\n다른 학생 게시글:\n${posts}\n분량: ${p.word_min}~${p.word_max}단어\n채점 시 학생 게시글과 다른 새로운 관점을 제시했는지도 반영할 것(단순 동의/재진술은 감점 요인).`;
        })();

  return `당신은 TOEFL Writing 채점관입니다. 아래 과제와 학생 답안을 4개 지표(각 0~5점)로 채점하세요.
${context}
문항 지시문: ${prompt}

학생 답안:
"""
${responseText}
"""

지표: task_achievement(과제 수행), coherence(논리적 흐름), lexical_resource(어휘), grammar(문법).
overall_band는 위 4개 지표를 종합한 1.0~6.0 사이 TOEFL 밴드 점수(0.5 단위)입니다.
feedback_ko는 한국어로 한두 문단, strengths/improvements는 한국어 짧은 문장 배열,
corrected_excerpts는 답안에서 고칠 만한 부분을 원문/수정본/한국어 이유로 짝지은 배열(0~3개)입니다.

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{"task_achievement":0,"coherence":0,"lexical_resource":0,"grammar":0,"overall_band":0,"feedback_ko":"","strengths":[],"improvements":[],"corrected_excerpts":[]}`;
}

function parseRubric(text: string): WritingRubricScore | null {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
    const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

    const overallBand = clamp(num(raw.overall_band), 1.0, 6.0);
    if (typeof raw.feedback_ko !== "string" || !raw.feedback_ko.trim()) return null;

    return {
      task_achievement: clamp(num(raw.task_achievement), 0, 5),
      coherence: clamp(num(raw.coherence), 0, 5),
      lexical_resource: clamp(num(raw.lexical_resource), 0, 5),
      grammar: clamp(num(raw.grammar), 0, 5),
      overall_band: overallBand,
      feedback_ko: raw.feedback_ko,
      strengths: strArr(raw.strengths),
      improvements: strArr(raw.improvements),
      corrected_excerpts: Array.isArray(raw.corrected_excerpts)
        ? (raw.corrected_excerpts as unknown[])
            .filter(
              (e): e is { original: string; corrected: string; reason_ko: string } =>
                !!e &&
                typeof e === "object" &&
                typeof (e as Record<string, unknown>).original === "string" &&
                typeof (e as Record<string, unknown>).corrected === "string" &&
                typeof (e as Record<string, unknown>).reason_ko === "string"
            )
            .slice(0, 5)
        : [],
    };
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
