// KO_EN_TYPE: 뜻을 보고 영어 단어를 타이핑 (Lv2, 회상). 채점은 rating.gradeTyped 재사용
// (정확히 일치=정답, 편집거리 1까지는 정답이되 hard로 채점).

import { gradeTyped } from "../rating";
import type { GradeResult } from "../types";

export type KoEnTypingItem = {
  itemType: "KO_EN_TYPE";
  prompt: string; // 뜻(한국어)
  correctAnswer: string; // 채점용. 화면에는 노출하지 않는다(호출자 책임)
};

export function generateKoEnTyping(target: { lemma: string; meaning: string }): KoEnTypingItem {
  return { itemType: "KO_EN_TYPE", prompt: target.meaning, correctAnswer: target.lemma };
}

export function gradeKoEnTyping(
  item: KoEnTypingItem,
  response: { typed: string; responseMs?: number }
): GradeResult {
  return gradeTyped(item.correctAnswer, response.typed, response.responseMs);
}
