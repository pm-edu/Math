// TOEFL P6 관리자 문항 등록 — Gemini로 Reading/Listening 7개 유형(§6) 초안을 생성하는 프롬프트·정규화 헬퍼.
// AI 생성 → 관리자 검토(화면) → /api/admin/toefl/items/bulk 저장, /admin/sat와 같은 흐름.
// Speaking/Writing 5개 유형은 이번 범위 밖(다음에 이어서 추가).

export type GenerableTaskType =
  | "complete_the_words"
  | "daily_life"
  | "academic_passage"
  | "choose_a_response"
  | "conversation"
  | "announcement"
  | "academic_talk";

export const GENERABLE_TASK_TYPES: {
  value: GenerableTaskType;
  label: string;
  section: "reading" | "listening";
  needsStimulus: boolean;
}[] = [
  { value: "complete_the_words", label: "Complete the Words (빈칸 채우기)", section: "reading", needsStimulus: false },
  { value: "daily_life", label: "Daily Life (생활문 독해)", section: "reading", needsStimulus: true },
  { value: "academic_passage", label: "Academic Passage (학술 지문 독해)", section: "reading", needsStimulus: true },
  { value: "choose_a_response", label: "Choose a Response (짧은 응답 고르기)", section: "listening", needsStimulus: false },
  { value: "conversation", label: "Conversation (대화)", section: "listening", needsStimulus: true },
  { value: "announcement", label: "Announcement (공지)", section: "listening", needsStimulus: true },
  { value: "academic_talk", label: "Academic Talk (강의)", section: "listening", needsStimulus: true },
];

export function taskTypeConfig(taskType: string) {
  return GENERABLE_TASK_TYPES.find((t) => t.value === taskType) ?? null;
}

const LETTERS = ["A", "B", "C", "D"] as const;

export type McqOptionDraft = { id: string; text: string };
export type McqItemDraft = {
  prompt: string;
  options: McqOptionDraft[];
  correct: string[];
  explanation_ko: string;
  skill_tags: string[];
};
export type BlankDraft = { id: string; masked: string; length: number; answer: string };
export type CompleteTheWordsItemDraft = {
  paragraph: string;
  blanks: BlankDraft[];
  explanation_ko: string;
  skill_tags: string[];
};
export type ChooseResponseItemDraft = {
  spoken_text: string;
  options: McqOptionDraft[];
  correct: string[];
  explanation_ko: string;
  skill_tags: string[];
};

export type GenerateResult =
  | { kind: "complete_the_words"; items: CompleteTheWordsItemDraft[] }
  | { kind: "choose_a_response"; items: ChooseResponseItemDraft[] }
  | { kind: "mcq_passage"; stimulus: { title: string; text: string }; items: McqItemDraft[] };

const DIFFICULTY_LABEL: Record<number, string> = {
  1: "very easy",
  2: "easy",
  3: "medium",
  4: "hard",
  5: "very hard",
};

const COMMON_RULES =
  'Do NOT copy, paraphrase, or reuse real TOEFL/ETS test content in any form — write fully original material. ' +
  'Write natural, exam-realistic English appropriate for the 2026 TOEFL format. ' +
  'Return ONLY valid JSON matching the shape below — no markdown code fences, no commentary before or after.';

const PASSAGE_STYLE: Record<string, string> = {
  daily_life:
    "an everyday, practical text such as a notice, schedule change, email excerpt, advertisement, or club announcement (60-120 words)",
  academic_passage:
    "an academic paragraph at university level on a natural science, social science, or humanities topic (140-220 words)",
};

const TRANSCRIPT_STYLE: Record<string, string> = {
  conversation:
    'a natural two-person spoken conversation transcript between a student and another person (professor, advisor, staff, or classmate), 6-10 turns, with speaker labels like "Student:" and "Advisor:"',
  announcement: "a spoken campus/public announcement transcript (event, facility, policy change, etc.), 4-8 sentences, natural spoken English",
  academic_talk: "a short lecture excerpt transcript on an academic topic, in a natural lecturing tone, 6-10 sentences",
};

export function buildGenerationPrompt(
  taskType: GenerableTaskType,
  opts: { itemsPerUnit: number; topic?: string; difficulty: number }
): string {
  const diff = DIFFICULTY_LABEL[opts.difficulty] ?? "medium";
  const topicLine = opts.topic?.trim() ? `Topic/theme: ${opts.topic.trim()}.` : "";
  const n = opts.itemsPerUnit;

  if (taskType === "complete_the_words") {
    return `You are writing TOEFL Reading "Complete the Words" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item is one short paragraph (2-3 sentences) containing exactly 2 words with 2-4 interior letters masked with a single underscore each (keep the first and last letters visible), testing vocabulary in context. Each masked word must be a distinct real English word.
${COMMON_RULES}

JSON shape:
{"items":[
  {"paragraph":"The eco_omy grew rapidly after the new policy was int_oduced.",
   "blanks":[{"id":"b1","masked":"eco_omy","length":7,"answer":"economy"},{"id":"b2","masked":"int_oduced","length":10,"answer":"introduced"}],
   "explanation_ko":"문맥상 economy(경제)와 introduced(도입되다)가 들어가야 자연스럽습니다.",
   "skill_tags":["vocab_in_context"]}
]}`;
  }

  if (taskType === "choose_a_response") {
    return `You are writing TOEFL Listening "Choose a Response" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item is a short spoken utterance (one sentence, a question or statement someone might say in daily campus life) plus exactly 4 possible responses (A-D), exactly ONE of which is the best natural response.
${COMMON_RULES}

JSON shape:
{"items":[
  {"spoken_text":"Does the shuttle run in the evening?",
   "options":[{"id":"A","text":"Yes, it runs every twenty minutes until 9 PM."},{"id":"B","text":"No, I have not read that book yet."},{"id":"C","text":"The library opens at nine tomorrow."},{"id":"D","text":"I usually walk instead of driving."}],
   "correct":["A"],
   "explanation_ko":"셔틀 운행 여부를 물었으므로, 운행 정보로 답하는 A가 자연스러운 응답입니다.",
   "skill_tags":["pragmatics"]}
]}`;
  }

  const style = PASSAGE_STYLE[taskType] ?? TRANSCRIPT_STYLE[taskType];
  const textField = taskType === "daily_life" || taskType === "academic_passage" ? "reading passage" : "listening transcript";

  return `You are writing a single TOEFL ${textField} plus ${n} comprehension questions about it.
Write ${style}. ${topicLine} Difficulty: ${diff}.
Then create ${n} multiple-choice comprehension questions about it, each with exactly 4 options (A-D) and exactly ONE correct answer. Vary the skills tested across items (main idea, supporting detail, inference, vocabulary in context, purpose/function).
${COMMON_RULES}

JSON shape:
{"stimulus":{"title":"short descriptive title","text":"the full passage or transcript text"},
 "items":[
   {"prompt":"the question text","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":["B"],"explanation_ko":"Korean explanation referencing the passage/transcript","skill_tags":["inference"]}
 ]}`;
}

function normalizeOptions(raw: unknown): McqOptionDraft[] {
  const arr = Array.isArray(raw) ? raw : [];
  const opts: McqOptionDraft[] = LETTERS.map((id, i) => {
    const o = arr[i] as Record<string, unknown> | undefined;
    return { id, text: String(o?.text ?? "").trim() };
  });
  return opts;
}

function normalizeCorrect(raw: unknown, options: McqOptionDraft[]): string[] {
  const ids = new Set(options.map((o) => o.id));
  const arr = (Array.isArray(raw) ? raw : [raw])
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter((v) => ids.has(v));
  return arr.length > 0 ? [arr[0]] : [options[0]?.id ?? "A"];
}

function normalizeSkillTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => String(t ?? "").trim()).filter(Boolean).slice(0, 5);
}

export type ParseResult = { ok: true; result: GenerateResult } | { ok: false; message: string };

export function parseGeneratedJson(taskType: GenerableTaskType, text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "생성 결과를 JSON으로 해석하지 못했습니다. 다시 시도해주세요." };
  }
  const obj = (data ?? {}) as Record<string, unknown>;

  if (taskType === "complete_the_words") {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: CompleteTheWordsItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const rawBlanks = Array.isArray(o.blanks) ? o.blanks : [];
      const blanks: BlankDraft[] = rawBlanks.map((b, i) => {
        const bo = (b ?? {}) as Record<string, unknown>;
        const masked = String(bo.masked ?? "").trim();
        return {
          id: String(bo.id ?? `b${i + 1}`),
          masked,
          length: Number(bo.length ?? masked.length) || masked.length,
          answer: String(bo.answer ?? "").trim(),
        };
      });
      return {
        paragraph: String(o.paragraph ?? "").trim(),
        blanks,
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, result: { kind: "complete_the_words", items } };
  }

  if (taskType === "choose_a_response") {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ChooseResponseItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const options = normalizeOptions(o.options);
      return {
        spoken_text: String(o.spoken_text ?? "").trim(),
        options,
        correct: normalizeCorrect(o.correct, options),
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, result: { kind: "choose_a_response", items } };
  }

  // mcq_passage group
  const stimRaw = (obj.stimulus ?? {}) as Record<string, unknown>;
  const stimulus = { title: String(stimRaw.title ?? "").trim(), text: String(stimRaw.text ?? "").trim() };
  if (!stimulus.text) return { ok: false, message: "지문/스크립트 생성에 실패했습니다." };

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: McqItemDraft[] = rawItems.map((it) => {
    const o = (it ?? {}) as Record<string, unknown>;
    const options = normalizeOptions(o.options);
    return {
      prompt: String(o.prompt ?? "").trim(),
      options,
      correct: normalizeCorrect(o.correct, options),
      explanation_ko: String(o.explanation_ko ?? "").trim(),
      skill_tags: normalizeSkillTags(o.skill_tags),
    };
  });
  if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
  return { ok: true, result: { kind: "mcq_passage", stimulus, items } };
}
