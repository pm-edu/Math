// Reading complete_the_words — 짧은 문단 안에 글자가 일부 가려진 단어 2개를 채우는 유형.
// 지문을 공유하지 않고 문항 하나가 자기 문단을 들고 있다(needsStimulus: false).
// 정답은 빈칸 id → 단어 맵이라 mcq 계열과 저장 형태가 다르다.

import { catalogEntry } from "@/lib/toefl/task-catalog";
import {
  COMMON_RULES,
  normalizeSkillTags,
  promptPreamble,
  type BlankDraft,
  type ItemDraft,
  type ItemGenerator,
  type ParsedDrafts,
} from "./types";

const entry = catalogEntry("complete_the_words")!;

export const completeTheWordsGenerator: ItemGenerator = {
  taskType: entry.taskType,
  section: entry.section,
  label: entry.label,
  needsStimulus: entry.needsStimulus,
  stimulusAudio: false,
  scoringMode: "auto_key",

  buildPrompt(opts) {
    const { n, diff, topicLine } = promptPreamble(opts);
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
  },

  parse(obj): ParsedDrafts {
    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items: ItemDraft[] = rawItems.map((it) => {
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
    return { ok: true, stimulus: null, items };
  },

  toItemRow(draft) {
    const paragraph = (draft.paragraph ?? "").trim();
    const blanks = (draft.blanks ?? []).filter((b) => b.masked && b.answer);
    if (!paragraph || blanks.length === 0) {
      return { ok: false, message: "빈칸 문항 내용이 비어 있어 건너뛰었습니다." };
    }
    return {
      ok: true,
      prompt: "Fill in the missing letters to complete each word.",
      // 정답(answer)은 payload에 넣지 않는다 — payload는 학생에게 그대로 내려간다.
      payload: { paragraph, blanks: blanks.map((b) => ({ id: b.id, masked: b.masked, length: b.length })) },
      answerKey: Object.fromEntries(blanks.map((b) => [b.id, b.answer.trim()])),
      spokenText: null,
    };
  },
};
