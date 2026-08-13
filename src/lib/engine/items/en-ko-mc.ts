// EN_KO_MC: 영→한 4지선다 (Lv1, 인지). 오답 선택지는 distractors.ts 우선순위를 따른다.
// 화면에 보여줄 때 보기 순서를 섞는 건 UI(Stage 3)의 몫이다 — 여기서는 순서를
// 고정해 결정적(테스트하기 쉬운) 결과를 낸다.

import { selectDistractors, type DistractorCandidate } from "../distractors";
import { deriveRating } from "../rating";
import type { GradeResult } from "../types";

export type McOption = { key: string; label: string };

export type EnKoMcItem = {
  itemType: "EN_KO_MC";
  prompt: string; // 영어 단어(lemma)
  options: McOption[];
  correctKey: string;
};

export function generateEnKoMc<T extends { meaning: string }>(
  target: { lemma: string; meaning: string },
  pool: DistractorCandidate<T>[],
  opts?: { count?: number; rng?: () => number }
): EnKoMcItem {
  const count = opts?.count ?? 3;
  const distractors = selectDistractors(target.meaning, pool, count, { rng: opts?.rng });
  const options: McOption[] = [
    { key: target.meaning, label: target.meaning },
    ...distractors.map((d) => ({ key: d.meaning, label: d.meaning })),
  ];
  return { itemType: "EN_KO_MC", prompt: target.lemma, options, correctKey: target.meaning };
}

export function gradeEnKoMc(
  item: EnKoMcItem,
  response: { chosenKey: string; responseMs?: number }
): GradeResult {
  const isCorrect = response.chosenKey === item.correctKey;
  const rating = deriveRating({ isCorrect, responseMs: response.responseMs });
  return { isCorrect, rating, detail: { chosenKey: response.chosenKey } };
}
