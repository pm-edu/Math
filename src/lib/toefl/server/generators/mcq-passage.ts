// 지문/스크립트 하나 + 그것에 대한 객관식 여러 개. 다섯 유형이 이 생성기를 공유한다:
//   Reading   daily_life · academic_passage        (읽는 지문)
//   Listening conversation · announcement · academic_talk  (듣는 스크립트 → TTS)
//
// 문항 구조가 같고 "지문이 글이냐 음성이냐"만 다르므로, 영역이 아니라 이 축으로 묶는 게 맞다.
// 유형별로 다른 것은 지문 스타일 문구 하나와 오디오 필요 여부뿐이다.

import type { ToeflTaskType } from "@/lib/toefl/types";
import { catalogEntry } from "@/lib/toefl/task-catalog";
import {
  COMMON_RULES,
  mcqItemRow,
  normalizeCorrect,
  normalizeOptions,
  normalizeSkillTags,
  promptPreamble,
  type ItemDraft,
  type ItemGenerator,
  type ParsedDrafts,
} from "./types";

type Spec = {
  taskType: ToeflTaskType;
  /** 프롬프트에 넣는 지문 스타일 설명. 유형별로 이것만 다르다. */
  style: string;
};

export function createMcqPassageGenerator(spec: Spec): ItemGenerator {
  const entry = catalogEntry(spec.taskType);
  if (!entry) throw new Error(`task-catalog에 없는 유형: ${spec.taskType}`);
  // 읽는 지문이면 오디오가 필요 없고, 듣는 스크립트면 TTS 대상이다.
  const reading = entry.section === "reading";

  return {
    taskType: entry.taskType,
    section: entry.section,
    label: entry.label,
    needsStimulus: entry.needsStimulus,
    stimulusAudio: !reading,
    scoringMode: "auto_key",

    buildPrompt(opts) {
      const { n, diff, topicLine } = promptPreamble(opts);
      const textField = reading ? "reading passage" : "listening transcript";
      return `You are writing a single TOEFL ${textField} plus ${n} comprehension questions about it.
Write ${spec.style}. ${topicLine} Difficulty: ${diff}.
Then create ${n} multiple-choice comprehension questions about it, each with exactly 4 options (A-D) and exactly ONE correct answer. Vary the skills tested across items (main idea, supporting detail, inference, vocabulary in context, purpose/function).
${COMMON_RULES}

JSON shape:
{"stimulus":{"title":"short descriptive title","text":"the full passage or transcript text"},
 "items":[
   {"prompt":"the question text","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":["B"],"explanation_ko":"Korean explanation referencing the passage/transcript","skill_tags":["inference"]}
 ]}`;
    },

    parse(obj): ParsedDrafts {
      const stimRaw = (obj.stimulus ?? {}) as Record<string, unknown>;
      const stimulus = { title: String(stimRaw.title ?? "").trim(), text: String(stimRaw.text ?? "").trim() };
      if (!stimulus.text) return { ok: false, message: "지문/스크립트 생성에 실패했습니다." };

      const rawItems = Array.isArray(obj.items) ? obj.items : [];
      const items: ItemDraft[] = rawItems.map((it) => {
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
      return { ok: true, stimulus, items };
    },

    toItemRow(draft) {
      return mcqItemRow(draft);
    },
  };
}

// 지문 스타일 — 예전 PASSAGE_STYLE / TRANSCRIPT_STYLE 상수를 유형 옆으로 옮긴 것.
// 영역·라벨·지문필요여부는 task-catalog 가 정하므로 여기엔 스타일 문구만 둔다.
export const MCQ_PASSAGE_SPECS: Spec[] = [
  {
    taskType: "daily_life",
    style:
      "an everyday, practical text such as a notice, schedule change, email excerpt, advertisement, or club announcement (60-120 words)",
  },
  {
    taskType: "academic_passage",
    style:
      "an academic paragraph at university level on a natural science, social science, or humanities topic (140-220 words)",
  },
  {
    taskType: "conversation",
    style:
      'a natural two-person spoken conversation transcript between a student and another person (professor, advisor, staff, or classmate), 6-10 turns, with speaker labels like "Student:" and "Advisor:"',
  },
  {
    taskType: "announcement",
    style: "a spoken campus/public announcement transcript (event, facility, policy change, etc.), 4-8 sentences, natural spoken English",
  },
  {
    taskType: "academic_talk",
    style: "a short lecture excerpt transcript on an academic topic, in a natural lecturing tone, 6-10 sentences",
  },
];
