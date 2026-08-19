// Listening choose_a_response — 짧은 발화 하나를 듣고 가장 자연스러운 응답을 고르는 유형.
// 지문을 공유하지 않지만 문항마다 자기 음성 클립이 필요하다(spoken_text → TTS).
// 그래서 stimulusAudio(지문 오디오)가 아니라 toItemRow가 spokenText를 돌려준다.

import { catalogEntry } from "@/lib/toefl/task-catalog";
import {
  COMMON_RULES,
  normalizeCorrect,
  normalizeOptions,
  normalizeSkillTags,
  promptPreamble,
  type ItemDraft,
  type ItemGenerator,
  type ParsedDrafts,
} from "./types";

const entry = catalogEntry("choose_a_response")!;

export const chooseAResponseGenerator: ItemGenerator = {
  taskType: entry.taskType,
  section: entry.section,
  label: entry.label,
  needsStimulus: entry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "auto_key",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
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
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
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
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const options = (draft.options ?? []).filter((o) => o.text?.trim());
    const correct = (draft.correct ?? []).filter((c) => options.some((o) => o.id === c));
    const spokenText = (draft.spoken_text ?? "").trim();
    if (options.length < 2 || correct.length === 0 || !spokenText) {
      return { ok: false, message: "응답 선택 문항 내용이 비어 있어 건너뛰었습니다." };
    }
    return {
      ok: true,
      prompt: "Choose the best response to what you hear.",
      // 들려줄 문장(spoken_text)은 payload에 넣지 않는다 — 넣으면 듣기 전에 읽어버린다(spec §5).
      // clip_path는 TTS 업로드 후 저장 라우트가 채운다.
      payload: { clip_path: null, options },
      answerKey: { correct },
      spokenText,
    };
  },
};
