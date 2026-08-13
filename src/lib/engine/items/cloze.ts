// CLOZE: 문맥 빈칸 채우기 (Lv3, 생산). 예문에서 단어를 낱말 경계 기준으로 가린다.
// 채점은 rating.gradeTyped 재사용(주관식과 동일한 근접오타 허용 규칙).

import { gradeTyped } from "../rating";
import { blankOut } from "./shared";
import type { GradeResult } from "../types";

export type ClozeItem = {
  itemType: "CLOZE";
  prompt: string; // 단어가 빈칸(_____)으로 가려진 문장
  correctAnswer: string;
};

export function generateCloze(target: { lemma: string; exampleEn: string }): ClozeItem {
  return { itemType: "CLOZE", prompt: blankOut(target.exampleEn, target.lemma), correctAnswer: target.lemma };
}

export function gradeCloze(item: ClozeItem, response: { typed: string; responseMs?: number }): GradeResult {
  return gradeTyped(item.correctAnswer, response.typed, response.responseMs);
}
