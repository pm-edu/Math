// 문항 생성기의 공용 타입과 정규화 헬퍼.
//
// 왜 "유형별 생성기"인가: 쪼개는 축은 영역(Reading/Listening/…)이 아니라 문항 유형이다.
// 지문+객관식(mcq-passage) 하나를 Reading 2종과 Listening 3종이 함께 쓰므로, 영역별로
// 파일을 나누면 같은 로직이 두 곳에 복제된다. 화면에서만 영역으로 묶어 보여준다(section 필드).
//
// 생성기 하나가 그 유형에 관한 모든 것을 든다 — 프롬프트 · 응답 해석 · 저장 형태 · 오디오
// 필요 여부 · 채점 방식. 유형을 추가하는 일이 "레지스트리에 항목 하나 추가"로 끝나게 하려는 것.

import type { ToeflScoringMode, ToeflSection, ToeflTaskType } from "@/lib/toefl/types";

export const LETTERS = ["A", "B", "C", "D"] as const;

export const DIFFICULTY_LABEL: Record<number, string> = {
  1: "very easy",
  2: "easy",
  3: "medium",
  4: "hard",
  5: "very hard",
};

export const COMMON_RULES =
  'Do NOT copy, paraphrase, or reuse real TOEFL/ETS test content in any form — write fully original material. ' +
  'Write natural, exam-realistic English appropriate for the 2026 TOEFL format. ' +
  'Return ONLY valid JSON matching the shape below — no markdown code fences, no commentary before or after.';

export type PromptOptions = { itemsPerUnit: number; topic?: string; difficulty: number };

export type McqOptionDraft = { id: string; text: string };
export type BlankDraft = { id: string; masked: string; length: number; answer: string };

/**
 * 검수 화면과 저장 라우트가 함께 쓰는 초안 한 건.
 * 유형마다 채우는 칸이 다르므로 전부 optional 이고, 무엇이 필수인지는 각 생성기의
 * toItemRow 가 판단한다(비어 있으면 그 문항만 건너뛴다).
 */
export type ItemDraft = {
  // 객관식 계열
  prompt?: string;
  options?: McqOptionDraft[];
  correct?: string[];
  // complete_the_words
  paragraph?: string;
  blanks?: BlankDraft[];
  // choose_a_response
  spoken_text?: string;
  // listen_and_repeat
  target_sentence?: string;
  // take_an_interview
  question_text?: string;
  turn_type?: string;
  // build_a_sentence
  chunks?: { id: string; text: string }[];
  order?: string[];
  accepted_alternatives?: string[][];
  // write_an_email
  scenario?: string;
  required_points?: string[];
  // academic_discussion
  professor_post?: string;
  student_posts?: { name: string; text: string }[];
  // 상황 설명(듣고 따라 말하기·문장 배열에서 화면 지시문으로 쓴다)
  context?: string;
  // 공통
  explanation_ko: string;
  skill_tags: string[];
};

export type StimulusDraft = { title: string; text: string };

export type ParsedDrafts =
  | { ok: true; stimulus: StimulusDraft | null; items: ItemDraft[] }
  | { ok: false; message: string };

/** toefl_item 한 행으로 저장할 형태. spokenText 가 있으면 문항별 음성 클립을 만든다. */
export type ItemRow =
  | {
      ok: true;
      prompt: string;
      payload: Record<string, unknown>;
      /** 루브릭 채점(ai_rubric) 유형은 정답이 없어 null 이다 — spec §6. */
      answerKey: Record<string, unknown> | null;
      /** 채워져 있으면 저장 후 이 문장으로 문항 음성을 만든다. */
      spokenText: string | null;
    }
  | { ok: false; message: string };

export type ItemGenerator = {
  taskType: ToeflTaskType;
  section: ToeflSection;
  /** 관리 화면의 유형 선택에 쓰는 라벨 */
  label: string;
  /** 지문·스크립트를 하나 만들고 문항들이 그것을 공유하는가 */
  needsStimulus: boolean;
  /** 지문 전체를 TTS로 읽어 오디오를 붙이는가 (듣기 지문) */
  stimulusAudio: boolean;
  scoringMode: ToeflScoringMode;
  buildPrompt(opts: PromptOptions): string;
  parse(obj: Record<string, unknown>): ParsedDrafts;
  toItemRow(draft: ItemDraft): ItemRow;
};

// ───────── 정규화 헬퍼 ─────────
// AI 응답은 형태가 조금씩 틀어지므로(보기 3개만 주거나 correct를 문자열로 주는 등)
// 화면에 넘기기 전에 항상 같은 모양으로 맞춘다.

export function normalizeOptions(raw: unknown): McqOptionDraft[] {
  const arr = Array.isArray(raw) ? raw : [];
  return LETTERS.map((id, i) => {
    const o = arr[i] as Record<string, unknown> | undefined;
    return { id, text: String(o?.text ?? "").trim() };
  });
}

export function normalizeCorrect(raw: unknown, options: McqOptionDraft[]): string[] {
  const ids = new Set(options.map((o) => o.id));
  const arr = (Array.isArray(raw) ? raw : [raw])
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter((v) => ids.has(v));
  return arr.length > 0 ? [arr[0]] : [options[0]?.id ?? "A"];
}

export function normalizeSkillTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 5);
}

/** 프롬프트 앞머리에 공통으로 붙는 두 줄(개수·주제·난이도)의 재료. */
export function promptPreamble(opts: PromptOptions) {
  return {
    n: opts.itemsPerUnit,
    diff: DIFFICULTY_LABEL[opts.difficulty] ?? "medium",
    topicLine: opts.topic?.trim() ? `Topic/theme: ${opts.topic.trim()}.` : "",
  };
}

/** 객관식 초안 → toefl_item 저장 형태. 보기·정답·질문이 하나라도 비면 건너뛴다. */
export function mcqItemRow(draft: ItemDraft, fallbackPrompt?: string): ItemRow {
  const options = (draft.options ?? []).filter((o) => o.text?.trim());
  const correct = (draft.correct ?? []).filter((c) => options.some((o) => o.id === c));
  const prompt = (draft.prompt ?? "").trim() || (fallbackPrompt ?? "");
  if (options.length < 2 || correct.length === 0 || !prompt) {
    return { ok: false, message: "문항 내용이 비어 있어 건너뛰었습니다." };
  }
  return {
    ok: true,
    prompt,
    payload: { format: "mcq", options, select_count: 1 },
    answerKey: { correct },
    spokenText: null,
  };
}
