// Writing AI 루브릭 채점. docs/toefl-spec.md §12.
// 지시서는 "Claude 호출"을 가정하지만 이 프로젝트는 Claude API 계약이 없어 Gemini로 통일하기로
// 확정했다(toefl-subsystem-plan 메모, P0 결정사항과 동일). src/lib/gemini-server.ts의 callGemini를
// 그대로 재사용(503/429 재시도는 이미 내장) — JSON 파싱 실패(형식 오류)는 별도로 최대 2회 재시도한다.

import { z } from "zod";
import { callGemini } from "@/lib/gemini-server";
import type { AcademicDiscussionPayload, WriteAnEmailPayload, WritingRubricScore } from "../types";

const MAX_PARSE_ATTEMPTS = 2;

// Gemini가 돌려주는 JSON을 검증한다. 예전엔 값이 이상해도(예: 문자열, 빠진 필드) num()/clamp()로
// 조용히 0이나 기본값으로 때워서, "AI가 진짜 0점을 줬다"와 "응답이 애초에 깨졌다"를 구분할 수
// 없었다(2026-08-27 교차검증 A5) — 이제 형태가 안 맞으면 파싱 자체를 실패시켜 재시도로 넘기고,
// 재시도까지 다 실패하면 호출부가 pending_manual로 남긴다.
//
// overall_band 하한을 0으로 뒀다(예전엔 1.0으로 clamp — TOEFL 공식 밴드 표시는 1.0부터지만,
// 채점 파이프라인 내부값으로는 완전 무응답/무관 답변이 진짜 0점을 받을 수 있어야 한다).
const writingRubricSchema = z.object({
  task_achievement: z.number().min(0).max(5),
  coherence: z.number().min(0).max(5),
  lexical_resource: z.number().min(0).max(5),
  grammar: z.number().min(0).max(5),
  overall_band: z.number().min(0).max(6),
  feedback_ko: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  corrected_excerpts: z
    .array(z.object({ original: z.string(), corrected: z.string(), reason_ko: z.string() }))
    .max(5)
    .default([]),
});

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
overall_band는 위 4개 지표를 종합한 0~6 사이 TOEFL 밴드 점수(0.5 단위)이며, 답안이 사실상
무의미하거나(예: 무관한 텍스트, 한두 단어만 있음) 과제와 전혀 관련이 없으면 0으로 주세요.
feedback_ko는 한국어로 한두 문단, strengths/improvements는 한국어 짧은 문장 배열,
corrected_excerpts는 답안에서 고칠 만한 부분을 원문/수정본/한국어 이유로 짝지은 배열(0~3개)입니다.

아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{"task_achievement":0,"coherence":0,"lexical_resource":0,"grammar":0,"overall_band":0,"feedback_ko":"","strengths":[],"improvements":[],"corrected_excerpts":[]}`;
}

function parseRubric(text: string): WritingRubricScore | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = writingRubricSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
