// CONTRAST: 혼동쌍 대조 문항(전 레벨). confusion-pairs.ts가 찾은 혼동쌍을 문맥 속에서
// 구분시킨다. 예: "The weather can _____ your mood." → affect vs effect.

import { blankOut } from "./shared";
import { deriveRating } from "../rating";
import type { GradeResult } from "../types";
import type { McOption } from "./en-ko-mc";

export type ContrastItem = {
  itemType: "CONTRAST";
  prompt: string; // 대상 단어가 빈칸으로 가려진 문장(대상 단어가 맞게 쓰인 실제 예문 기준)
  options: McOption[]; // 정답(target)과 혼동 단어 둘
  correctKey: string;
};

// 예문에서 단어를 못 찾으면(불규칙 활용 등) null — 호출자가 다른 문항 유형으로 대체한다.
export function generateContrast(params: {
  target: { lemma: string; exampleEn: string };
  confusedWith: { lemma: string };
}): ContrastItem | null {
  const prompt = blankOut(params.target.exampleEn, params.target.lemma);
  if (prompt === null) return null;
  const options: McOption[] = [
    { key: params.target.lemma, label: params.target.lemma },
    { key: params.confusedWith.lemma, label: params.confusedWith.lemma },
  ];
  return { itemType: "CONTRAST", prompt, options, correctKey: params.target.lemma };
}

export function gradeContrast(
  item: ContrastItem,
  response: { chosenKey: string; responseMs?: number }
): GradeResult {
  const isCorrect = response.chosenKey === item.correctKey;
  const rating = deriveRating({ isCorrect, responseMs: response.responseMs });
  return { isCorrect, rating, detail: { chosenKey: response.chosenKey } };
}
