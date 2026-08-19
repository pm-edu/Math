// Speaking 2종. 둘 다 학생 음성을 받는다.
//
//   listen_and_repeat  들은 문장을 그대로 따라 말하기 → auto_transcript (STT 대조)
//   take_an_interview  질문을 듣고 답하기            → ai_rubric (정답 없음)
//
// 공통 주의: 학생이 "들어야 하는" 문장·질문이 화면에 글자로 보이면 시험이 성립하지 않는다.
// 두 값 모두 payload 에 담기지만(TTS·채점이 읽어야 해서), 학생에게 내려보내는 길목인
// /api/toefl/attempts/[id]/current 가 걷어낸다. 새 필드를 payload 에 넣을 때는 그 라우트의
// 제거 목록도 함께 갱신해야 한다 — 예전에 target_sentence 가 실제로 샜던 자리다.

import {
  COMMON_RULES,
  normalizeSkillTags,
  promptPreamble,
  type ItemDraft,
  type ItemGenerator,
  type ParsedDrafts,
} from "./types";
import { catalogEntry } from "@/lib/toefl/task-catalog";

// 문장이 길수록 따라 말할 시간을 더 준다(spec §6: 8/10/12초).
export function responseWindowFor(sentence: string): number {
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 8) return 8;
  if (words <= 12) return 10;
  return 12;
}

const listenAndRepeatEntry = catalogEntry("listen_and_repeat")!;

export const listenAndRepeatGenerator: ItemGenerator = {
  taskType: listenAndRepeatEntry.taskType,
  section: listenAndRepeatEntry.section,
  label: listenAndRepeatEntry.label,
  needsStimulus: listenAndRepeatEntry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "auto_transcript",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
    return `You are writing TOEFL Speaking "Listen and Repeat" practice items.
Create ${n} independent items. ${topicLine} Difficulty: ${diff}.
Each item is ONE natural English sentence that a student will hear once and must repeat word for word. Use everyday campus or daily-life situations. Keep each sentence between 6 and 16 words, easy to say aloud, with no unusual proper nouns, no numbers written as digits, and no abbreviations.
${COMMON_RULES}

JSON shape:
{"items":[
  {"target_sentence":"The library closes early on Friday afternoons.",
   "context":"You are asking about library hours.",
   "explanation_ko":"도서관 운영시간에 대한 문장으로, 강세는 early와 Friday에 둡니다.",
   "skill_tags":["pronunciation","fluency"]}
]}`;
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        target_sentence: String(o.target_sentence ?? "").trim(),
        context: String(o.context ?? "").trim(),
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const sentence = (draft.target_sentence ?? "").trim();
    if (!sentence) return { ok: false, message: "따라 말할 문장이 비어 있어 건너뛰었습니다." };
    return {
      ok: true,
      // 화면에 보이는 지시문. 문장 자체는 여기 넣지 않는다.
      prompt: (draft.context ?? "").trim() || "Listen to the sentence and repeat it exactly as you hear it.",
      // clip_path 는 저장 라우트가 TTS 업로드 후 채운다.
      payload: { clip_path: null, target_sentence: sentence, response_window_sec: responseWindowFor(sentence) },
      answerKey: { target_sentence: sentence },
      spokenText: sentence,
    };
  },
};

const interviewEntry = catalogEntry("take_an_interview")!;

// 준비시간·응답시간은 spec §6 값. 문항마다 다를 이유가 없어 상수로 둔다.
const PREP_SEC = 15;
const RESPONSE_SEC = 45;

export const takeAnInterviewGenerator: ItemGenerator = {
  taskType: interviewEntry.taskType,
  section: interviewEntry.section,
  label: interviewEntry.label,
  needsStimulus: interviewEntry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "ai_rubric",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
    return `You are writing TOEFL Speaking "Take an Interview" practice items.
Create ${n} independent interview questions. ${topicLine} Difficulty: ${diff}.
Each item is ONE spoken interview question a student answers in about 45 seconds. Vary the turn types across items: "opinion" (state and defend a preference), "compare" (weigh two options), "hypothetical" (imagine a situation). Keep each question to one or two sentences of natural spoken English.
${COMMON_RULES}

JSON shape:
{"items":[
  {"question_text":"Some students prefer studying in groups, while others study alone. Which do you think works better, and why?",
   "turn_type":"opinion",
   "explanation_ko":"선호를 밝히고 이유를 두 가지 이상 드는 구조로 답하면 좋습니다.",
   "skill_tags":["topic_development"]}
]}`;
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const allowed = new Set(["opinion", "compare", "hypothetical"]);
    const items: ItemDraft[] = rawItems.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const turn = String(o.turn_type ?? "").trim().toLowerCase();
      return {
        question_text: String(o.question_text ?? "").trim(),
        turn_type: allowed.has(turn) ? turn : "opinion",
        explanation_ko: String(o.explanation_ko ?? "").trim(),
        skill_tags: normalizeSkillTags(o.skill_tags),
      };
    });
    if (items.length === 0) return { ok: false, message: "생성된 문항이 없습니다." };
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const question = (draft.question_text ?? "").trim();
    if (!question) return { ok: false, message: "인터뷰 질문이 비어 있어 건너뛰었습니다." };
    return {
      ok: true,
      // spec §6: 질문 텍스트는 화면에 표시하지 않는다(음성 only). prompt 는 지시문만.
      prompt: "Listen to the question, then record your answer.",
      payload: {
        question_audio_path: null,
        question_text: question,
        prep_sec: PREP_SEC,
        response_sec: RESPONSE_SEC,
        turn_type: draft.turn_type ?? "opinion",
      },
      // 루브릭 채점이라 정답이 없다.
      answerKey: null,
      spokenText: question,
    };
  },
};
