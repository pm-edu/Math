// 유형별 생성기 등록소.
//
// 목록의 주인은 task-catalog 다. 여기서는 카탈로그에서 generatable 로 표시된 유형마다
// 실제 생성기를 붙인다 — 붙일 게 없으면 모듈을 읽는 시점에 바로 터진다. 그래야 화면에는
// 보이는데 생성이 안 되는 어긋남이 배포까지 살아남지 않는다.
//
// 지금 등록: Reading 3 · Listening 4 · Speaking 2 · Writing 3 = 12종(전부).
// ai_rubric 유형(take_an_interview · write_an_email · academic_discussion)은 정답이 없어
// toItemRow 가 answerKey: null 을 돌려준다 — 저장 라우트가 "정답 필수"를 전제하지 않는다.

import type { ToeflSection, ToeflTaskType } from "@/lib/toefl/types";
import { GENERATABLE_TASKS } from "@/lib/toefl/task-catalog";
import { chooseAResponseGenerator } from "./choose-a-response";
import { completeTheWordsGenerator } from "./complete-the-words";
import { createMcqPassageGenerator, MCQ_PASSAGE_SPECS } from "./mcq-passage";
import { listenAndRepeatGenerator, takeAnInterviewGenerator } from "./speaking";
import { academicDiscussionGenerator, buildASentenceGenerator, writeAnEmailGenerator } from "./writing";
import type { ItemGenerator } from "./types";

// 지문+객관식으로 만들어지는 유형들
const MCQ_BY_TYPE = new Map(MCQ_PASSAGE_SPECS.map((s) => [s.taskType, s]));

// 자기만의 구조를 갖는 유형들
const STANDALONE: Partial<Record<ToeflTaskType, ItemGenerator>> = {
  complete_the_words: completeTheWordsGenerator,
  choose_a_response: chooseAResponseGenerator,
  listen_and_repeat: listenAndRepeatGenerator,
  take_an_interview: takeAnInterviewGenerator,
  build_a_sentence: buildASentenceGenerator,
  write_an_email: writeAnEmailGenerator,
  academic_discussion: academicDiscussionGenerator,
};

const ALL: ItemGenerator[] = GENERATABLE_TASKS.map((entry) => {
  const standalone = STANDALONE[entry.taskType];
  if (standalone) return standalone;
  const spec = MCQ_BY_TYPE.get(entry.taskType);
  if (!spec) {
    throw new Error(
      `task-catalog에서 generatable: true 인데 생성기가 없는 유형입니다: ${entry.taskType}`
    );
  }
  return createMcqPassageGenerator(spec);
});

export const GENERATOR_LIST: ItemGenerator[] = ALL;

const BY_TYPE = new Map(ALL.map((g) => [g.taskType, g]));

export function getGenerator(taskType: string): ItemGenerator | null {
  return BY_TYPE.get(taskType as ToeflTaskType) ?? null;
}

export function generatorsForSection(section: ToeflSection): ItemGenerator[] {
  return ALL.filter((g) => g.section === section);
}
