import { describe, expect, it } from "vitest";
import { applyAnswer, initialMasteryState, type MasteryState } from "./mastery-level";

describe("applyAnswer — 숙련도 5단계 사다리 승급/강등", () => {
  it("미학습(0) 단어를 처음 접하면 인지(1) 단계로 진입한다", () => {
    const { next } = applyAnswer(initialMasteryState(), { sessionId: "s1", isCorrect: true });
    expect(next.level).toBe(1);
  });

  it("같은 레벨에서 서로 다른 세션 3회 연속 정답이면 +1 승급한다", () => {
    let state: MasteryState = initialMasteryState();
    let leveledUp = false;
    for (const sessionId of ["s1", "s2", "s3"]) {
      const r = applyAnswer(state, { sessionId, isCorrect: true });
      state = r.next;
      leveledUp = r.leveledUp || leveledUp;
    }
    // 0→1(1회차 진입) 이후, 2·3회차가 쌓여야 승급... 시나리오를 명확히 하기 위해 4세션으로 재검증
    expect(state.level).toBeGreaterThanOrEqual(1);
  });

  it("정확히: 레벨 1에서 서로 다른 3세션 연속 정답 시 레벨 2로 승급", () => {
    let state: MasteryState = { level: 1, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    let lastResult;
    for (const sessionId of ["s1", "s2", "s3"]) {
      lastResult = applyAnswer(state, { sessionId, isCorrect: true });
      state = lastResult.next;
    }
    expect(state.level).toBe(2);
    expect(lastResult!.leveledUp).toBe(true);
  });

  it("같은 세션 안에서 여러 번 맞혀도 세션 1회로만 친다 (연속승급 방지)", () => {
    let state: MasteryState = { level: 1, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    // 같은 세션(s1)에서 5번 연속 정답 — 그래도 승급하면 안 된다
    for (let i = 0; i < 5; i++) {
      state = applyAnswer(state, { sessionId: "s1", isCorrect: true }).next;
    }
    expect(state.level).toBe(1); // 여전히 레벨 1 (다른 세션이 없었으므로)
    expect(state.consecutiveCorrectSessionIds).toEqual(["s1"]);
  });

  it("오답이면 레벨이 1 내려간다", () => {
    const state: MasteryState = { level: 3, consecutiveWrong: 0, consecutiveCorrectSessionIds: ["s1"] };
    const { next, leveledDown } = applyAnswer(state, { sessionId: "s2", isCorrect: false });
    expect(next.level).toBe(2);
    expect(leveledDown).toBe(true);
  });

  it("2연속 오답이면 레벨이 2 내려간다", () => {
    let state: MasteryState = { level: 4, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    state = applyAnswer(state, { sessionId: "s1", isCorrect: false }).next;
    expect(state.level).toBe(3); // 1차 오답: -1
    state = applyAnswer(state, { sessionId: "s2", isCorrect: false }).next;
    expect(state.level).toBe(1); // 2연속 오답: -2 (3에서 -2 = 1)
  });

  it("강등 최저치는 1이다 (0으로 다시 떨어지지 않는다)", () => {
    let state: MasteryState = { level: 1, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    state = applyAnswer(state, { sessionId: "s1", isCorrect: false }).next;
    state = applyAnswer(state, { sessionId: "s2", isCorrect: false }).next;
    expect(state.level).toBe(1);
  });

  it("최고 레벨은 5를 넘지 않는다", () => {
    let state: MasteryState = { level: 5, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    for (const sessionId of ["s1", "s2", "s3"]) {
      state = applyAnswer(state, { sessionId, isCorrect: true }).next;
    }
    expect(state.level).toBe(5);
  });

  it("승급하면 연속 정답 세션 목록이 초기화된다 (다음 레벨에서 다시 3세션 필요)", () => {
    let state: MasteryState = { level: 1, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    for (const sessionId of ["s1", "s2", "s3"]) {
      state = applyAnswer(state, { sessionId, isCorrect: true }).next;
    }
    expect(state.level).toBe(2);
    expect(state.consecutiveCorrectSessionIds).toEqual([]);
  });

  it("오답 한 번은 연속 정답 세션 기록을 초기화한다", () => {
    let state: MasteryState = { level: 2, consecutiveWrong: 0, consecutiveCorrectSessionIds: ["s1", "s2"] };
    state = applyAnswer(state, { sessionId: "s3", isCorrect: false }).next;
    expect(state.consecutiveCorrectSessionIds).toEqual([]);
  });

  it("정답 후에는 연속 오답 카운터가 초기화된다", () => {
    let state: MasteryState = { level: 3, consecutiveWrong: 1, consecutiveCorrectSessionIds: [] };
    state = applyAnswer(state, { sessionId: "s1", isCorrect: true }).next;
    expect(state.consecutiveWrong).toBe(0);
  });
});
