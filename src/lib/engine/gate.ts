// 유닛 완전학습 게이트(90%) 판정 + 교정학습(corrective loop) 큐 생성.
//
// 통과 조건(AND): 유닛 단어의 mastery_threshold(기본 90%) 이상이 Lv3 이상
//                AND 유닛 종합평가 점수가 같은 기준(기본 90점) 이상.
// 미통과 시: 틀린 단어만, 직전과 다른 문항 유형으로 교정 세션을 만든다.
// 최대 3사이클 후에도 미달이면 "집중관리 단어"로 태깅한다(호출자가 exhausted로 판단).

import type { ItemType, MasteryLevel } from "./types";

export const MASTERY_LEVEL_THRESHOLD: MasteryLevel = 3;
export const MAX_CORRECTIVE_CYCLES = 3;

export function computeMasteryRatio(levels: MasteryLevel[]): number {
  if (levels.length === 0) return 0;
  const mastered = levels.filter((lv) => lv >= MASTERY_LEVEL_THRESHOLD).length;
  return mastered / levels.length;
}

export function passesGate(
  input: { masteryRatio: number; testScore: number },
  thresholds: { masteryThreshold?: number; testThreshold?: number } = {}
): boolean {
  const masteryThreshold = thresholds.masteryThreshold ?? 0.9;
  const testThreshold = thresholds.testThreshold ?? 90;
  return input.masteryRatio >= masteryThreshold && input.testScore >= testThreshold;
}

export function buildCorrectiveQueue(params: {
  wrongWordIds: string[];
  lastItemTypeByWord: Record<string, ItemType>;
  rotation: ItemType[]; // 이 순서대로 "다음에 쓸 유형"을 고른다
}): Array<{ wordId: string; itemType: ItemType }> {
  const { wrongWordIds, lastItemTypeByWord, rotation } = params;
  if (rotation.length === 0) return [];

  return wrongWordIds.map((wordId) => {
    const last = lastItemTypeByWord[wordId];
    const lastIndex = last ? rotation.indexOf(last) : -1;
    // 회전 목록에서 직전 유형 바로 다음 것을 고른다. 직전 기록이 없거나
    // 회전 목록에 없는 유형이었으면 목록의 첫 유형부터 시작한다.
    const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % rotation.length;
    return { wordId, itemType: rotation[nextIndex] };
  });
}

export function advanceCycle(cycleCount: number): { cycleCount: number; exhausted: boolean } {
  const next = cycleCount + 1;
  return { cycleCount: next, exhausted: next >= MAX_CORRECTIVE_CYCLES };
}
