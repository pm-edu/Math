import { describe, expect, it } from "vitest";
import { decideNextStep, judgeMastery } from "./progression";

const results = (correct: number, total: number) =>
  Array.from({ length: total }, (_, i) => i < correct);

describe("judgeMastery", () => {
  it("데이터 부족(minItems 미달)이면 mastered=false, insufficient_items", () => {
    const r = judgeMastery({
      recentFirstTryResults: results(5, 5),
      sessionCount: 3,
      hardItemsCorrect: 5,
      targetAccuracy: 0.85,
      minItems: 8,
    });
    expect(r.mastered).toBe(false);
    expect(r.reason).toBe("insufficient_items");
  });

  it("정답률이 목표 미달이면 mastered=false, accuracy_below_target", () => {
    const r = judgeMastery({
      recentFirstTryResults: results(5, 10), // 0.5
      sessionCount: 3,
      hardItemsCorrect: 5,
      targetAccuracy: 0.85,
      minItems: 8,
    });
    expect(r.mastered).toBe(false);
    expect(r.reason).toBe("accuracy_below_target");
    expect(r.accuracy).toBeCloseTo(0.5);
  });

  it("정답률은 충족해도 세션 2회 미만이면 mastered=false, insufficient_sessions", () => {
    const r = judgeMastery({
      recentFirstTryResults: results(8, 8), // 1.0
      sessionCount: 1,
      hardItemsCorrect: 5,
      targetAccuracy: 0.85,
      minItems: 8,
    });
    expect(r.mastered).toBe(false);
    expect(r.reason).toBe("insufficient_sessions");
  });

  it("정답률·세션수는 충족해도 고난도 정답이 3개 미만이면 mastered=false, insufficient_hard_items", () => {
    const r = judgeMastery({
      recentFirstTryResults: results(8, 8),
      sessionCount: 2,
      hardItemsCorrect: 2,
      targetAccuracy: 0.85,
      minItems: 8,
    });
    expect(r.mastered).toBe(false);
    expect(r.reason).toBe("insufficient_hard_items");
  });

  it("세 조건(정답률·세션수·고난도 정답수) 모두 충족하면 mastered=true", () => {
    const r = judgeMastery({
      recentFirstTryResults: results(7, 8), // 0.875
      sessionCount: 2,
      hardItemsCorrect: 3,
      targetAccuracy: 0.85,
      minItems: 8,
    });
    expect(r.mastered).toBe(true);
    expect(r.reason).toBe("mastered");
  });
});

describe("decideNextStep", () => {
  it("정답률 >= 0.85 (아직 mastered 아님) → retry_same, difficultyDelta 0", () => {
    const r = decideNextStep({ accuracy: 0.9, consecutiveFailedSessions: 0 });
    expect(r).toEqual({ action: "retry_same", difficultyDelta: 0 });
  });

  it("정답률 0.50~0.85 → retry_easier, difficultyDelta -1", () => {
    const r = decideNextStep({ accuracy: 0.6, consecutiveFailedSessions: 0 });
    expect(r).toEqual({ action: "retry_easier", difficultyDelta: -1 });
  });

  it("정답률 < 0.50 → fallback_prereq", () => {
    const r = decideNextStep({ accuracy: 0.3, consecutiveFailedSessions: 0 });
    expect(r.action).toBe("fallback_prereq");
  });

  it("3세션 규칙: 연속 실패 3회면 정답률과 무관하게 flag_stuck", () => {
    const highAccuracyButStuck = decideNextStep({ accuracy: 0.9, consecutiveFailedSessions: 3 });
    expect(highAccuracyButStuck.action).toBe("flag_stuck");

    const lowAccuracyStuck = decideNextStep({ accuracy: 0.1, consecutiveFailedSessions: 3 });
    expect(lowAccuracyStuck.action).toBe("flag_stuck");
  });

  it("연속 실패 2회까지는 flag_stuck이 아니다(3회부터)", () => {
    const r = decideNextStep({ accuracy: 0.3, consecutiveFailedSessions: 2 });
    expect(r.action).toBe("fallback_prereq");
  });
});
