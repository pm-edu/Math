import { describe, expect, it } from "vitest";
import { applyAnswer, initialMasteryState, type MasteryState } from "./mastery-level";
import { scheduleNext, daysBetween, type FsrsState } from "./fsrs";

// FSRS(언제 복습할지) + 사다리(무엇을 낼지)를 함께 굴려서, 서로 다른 학습 습관을 가진
// 학생 3명을 시뮬레이션한다. 단위 테스트가 각 함수를 따로 검증했다면, 이 파일은
// "두 축을 합쳤을 때 의도한 대로 동작하는가"를 검증한다.

const NOW = new Date("2026-08-13T00:00:00.000Z");

describe("시나리오 A — 성실형: 매번 다른 날 꾸준히 복습", () => {
  it("서로 다른 세션 12번 연속 정답이면 레벨 5(완전습득)까지 도달하고, FSRS 간격도 길게 늘어난다", () => {
    let mastery: MasteryState = initialMasteryState();
    let fsrs: FsrsState | null = null;

    for (let i = 1; i <= 12; i++) {
      const sessionId = `diligent-day-${i}`;
      mastery = applyAnswer(mastery, { sessionId, isCorrect: true }).next;
      fsrs = scheduleNext(fsrs, "good", NOW);
    }

    expect(mastery.level).toBe(5);
    // 12번째 복습 시점엔 이미 상당히 긴 간격(수 주 단위)을 얻었어야 한다.
    expect(fsrs!.stability).toBeGreaterThan(20);
  });
});

describe("시나리오 B — 벼락치기형: 하루에 몰아서 여러 번 풀고 다시 안 옴", () => {
  it("같은 세션에서 아무리 많이 맞혀도 레벨 1에서 멈춘다 (완전학습의 핵심 방어선)", () => {
    let mastery: MasteryState = initialMasteryState();
    const sessionId = "cram-allnighter";

    for (let i = 0; i < 12; i++) {
      mastery = applyAnswer(mastery, { sessionId, isCorrect: true }).next;
    }

    // 12번 다 맞혔지만 전부 같은 세션이라 "3회 연속 정답"으로 안 쳐준다.
    expect(mastery.level).toBe(1);
    expect(mastery.consecutiveCorrectSessionIds).toEqual([sessionId]);
  });

  it("성실형과 벼락치기형은 같은 정답 횟수(12회)에도 레벨이 다르다", () => {
    let diligent: MasteryState = initialMasteryState();
    for (let i = 1; i <= 12; i++) {
      diligent = applyAnswer(diligent, { sessionId: `day-${i}`, isCorrect: true }).next;
    }

    let crammer: MasteryState = initialMasteryState();
    for (let i = 0; i < 12; i++) {
      crammer = applyAnswer(crammer, { sessionId: "one-night", isCorrect: true }).next;
    }

    expect(diligent.level).toBeGreaterThan(crammer.level);
  });
});

describe("시나리오 C — 오래 쉰 복귀형: 한동안 안 하다가 돌아와서 잊어버림", () => {
  it("60일 쉬고 돌아와 오답을 내면, 레벨이 내려가고 FSRS 간격도 짧게 재조정된다", () => {
    // 이전에 레벨 3까지 올려두고 안정적으로 알고 있었다고 가정
    const priorMastery: MasteryState = { level: 3, consecutiveWrong: 0, consecutiveCorrectSessionIds: [] };
    const priorFsrs: FsrsState = { stability: 20, difficulty: 5, dueAt: NOW.toISOString() };

    const returnDate = new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000); // 60일 후
    expect(daysBetween(new Date(priorFsrs.dueAt), returnDate)).toBeGreaterThan(30); // 복습일이 한참 지났음

    const { next: afterWrong, leveledDown } = applyAnswer(priorMastery, {
      sessionId: "return-1",
      isCorrect: false,
    });
    const fsrsAfterWrong = scheduleNext(priorFsrs, "again", returnDate);

    expect(leveledDown).toBe(true);
    expect(afterWrong.level).toBe(2); // 3 - 1(오답)
    // 예전 stability(20일)를 그대로 믿지 않고, "다시 짧게" 재조정한다.
    expect(fsrsAfterWrong.stability).toBeLessThan(priorFsrs.stability / 2);
    expect(daysBetween(returnDate, new Date(fsrsAfterWrong.dueAt))).toBeLessThan(10);
  });

  it("복귀 후 한 번 맞혔다고 바로 레벨이 돌아오지는 않는다 (다시 3세션 채워야 함)", () => {
    const afterWrong: MasteryState = { level: 2, consecutiveWrong: 1, consecutiveCorrectSessionIds: [] };
    const { next } = applyAnswer(afterWrong, { sessionId: "return-2", isCorrect: true });
    expect(next.level).toBe(2); // 아직 승급 조건(3세션) 안 채워짐
  });
});
