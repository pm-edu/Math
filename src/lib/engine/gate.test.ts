import { describe, expect, it } from "vitest";
import {
  computeMasteryRatio,
  passesGate,
  buildCorrectiveQueue,
  advanceCycle,
  MASTERY_LEVEL_THRESHOLD,
  MAX_CORRECTIVE_CYCLES,
} from "./gate";

describe("computeMasteryRatio — 유닛 단어 중 Lv3 이상 비율", () => {
  it("전부 Lv3 이상이면 1.0", () => {
    expect(computeMasteryRatio([3, 4, 5, 3])).toBe(1);
  });

  it("절반이 Lv3 미만이면 0.5", () => {
    expect(computeMasteryRatio([1, 2, 3, 4])).toBe(0.5);
  });

  it("단어가 없으면 0 (통과 불가능한 상태로 취급)", () => {
    expect(computeMasteryRatio([])).toBe(0);
  });

  it("기준 레벨(MASTERY_LEVEL_THRESHOLD)은 3이다", () => {
    expect(MASTERY_LEVEL_THRESHOLD).toBe(3);
  });
});

describe("passesGate — 90% 게이트 판정 (마스터리 비율 AND 종합평가 점수)", () => {
  it("마스터리 90%+ 이고 평가 90점+ 이면 통과", () => {
    expect(passesGate({ masteryRatio: 0.9, testScore: 90 })).toBe(true);
    expect(passesGate({ masteryRatio: 0.95, testScore: 100 })).toBe(true);
  });

  it("마스터리는 충분해도 평가 점수가 모자라면 불통과", () => {
    expect(passesGate({ masteryRatio: 1.0, testScore: 89 })).toBe(false);
  });

  it("평가 점수는 충분해도 마스터리가 모자라면 불통과 (한쪽만으론 안 됨)", () => {
    expect(passesGate({ masteryRatio: 0.5, testScore: 100 })).toBe(false);
  });

  it("기준을 다르게 주면(유닛별 mastery_threshold) 그 기준을 따른다", () => {
    expect(passesGate({ masteryRatio: 0.8, testScore: 90 }, { masteryThreshold: 0.8 })).toBe(true);
  });
});

describe("buildCorrectiveQueue — 교정학습 큐: 틀린 단어를 이전과 다른 문항 유형으로", () => {
  it("틀린 단어마다 이전에 쓰지 않은 문항 유형을 배정한다", () => {
    const queue = buildCorrectiveQueue({
      wrongWordIds: ["w1", "w2"],
      lastItemTypeByWord: { w1: "EN_KO_MC", w2: "KO_EN_TYPE" },
      rotation: ["EN_KO_MC", "KO_EN_TYPE", "CLOZE"],
    });
    const w1 = queue.find((q) => q.wordId === "w1")!;
    const w2 = queue.find((q) => q.wordId === "w2")!;
    expect(w1.itemType).not.toBe("EN_KO_MC");
    expect(w2.itemType).not.toBe("KO_EN_TYPE");
  });

  it("이전 기록이 없는 단어는 회전 목록의 첫 유형을 받는다", () => {
    const queue = buildCorrectiveQueue({
      wrongWordIds: ["w1"],
      lastItemTypeByWord: {},
      rotation: ["CLOZE", "EN_KO_MC"],
    });
    expect(queue[0].itemType).toBe("CLOZE");
  });

  it("빈 틀린단어 목록이면 빈 큐를 반환한다", () => {
    expect(buildCorrectiveQueue({ wrongWordIds: [], lastItemTypeByWord: {}, rotation: ["EN_KO_MC"] })).toEqual([]);
  });
});

describe("advanceCycle — 교정학습 반복 횟수 관리 (최대 3사이클)", () => {
  it("사이클을 1씩 늘린다", () => {
    expect(advanceCycle(0).cycleCount).toBe(1);
    expect(advanceCycle(1).cycleCount).toBe(2);
  });

  it("최대 사이클(3) 상수를 노출한다", () => {
    expect(MAX_CORRECTIVE_CYCLES).toBe(3);
  });

  it("최대 사이클에 도달하면 exhausted=true (집중관리 단어로 태깅해야 함)", () => {
    expect(advanceCycle(2).exhausted).toBe(true); // 2→3, 3회차 도달
    expect(advanceCycle(1).exhausted).toBe(false); // 1→2, 아직 여유
  });
});
