import { describe, expect, it } from "vitest";
import { scheduleNext, deriveGrade, type MathFsrsState } from "./fsrs";

const FRESH: MathFsrsState = { stability: null, difficulty: null, reps: 0, lapses: 0 };

describe("scheduleNext — math_unit_states용 FSRS 래퍼 (engine/fsrs.ts 재사용)", () => {
  it("처음 복습(상태 없음)은 intervalDays > 0을 준다", () => {
    const next = scheduleNext(FRESH, 3); // good
    expect(next.intervalDays).toBeGreaterThan(0);
  });

  it("반복해서 잘 맞히면(good/easy) 간격이 점점 늘어난다", () => {
    let state: MathFsrsState = FRESH;
    let prevInterval = 0;
    for (let i = 0; i < 4; i++) {
      const next = scheduleNext(state, 4); // easy
      expect(next.intervalDays).toBeGreaterThan(prevInterval);
      prevInterval = next.intervalDays;
      state = { stability: next.stability, difficulty: next.difficulty, reps: state.reps + 1, lapses: state.lapses };
    }
  });

  it("잘 유지되던 간격도 오답(again)이면 큰 폭으로 줄어든다(lapse)", () => {
    // 먼저 여러 번 easy로 간격을 키워둔다.
    let state: MathFsrsState = FRESH;
    for (let i = 0; i < 3; i++) {
      const next = scheduleNext(state, 4);
      state = { stability: next.stability, difficulty: next.difficulty, reps: state.reps + 1, lapses: state.lapses };
    }
    const beforeLapseInterval = scheduleNext(state, 4).intervalDays;

    const lapsed = scheduleNext(state, 1); // again
    expect(lapsed.intervalDays).toBeLessThan(beforeLapseInterval / 2);
  });

  it("reps/lapses 값 자체는 스케줄 계산에 영향을 주지 않는다(지시서 시그니처를 위한 입력일 뿐)", () => {
    const a = scheduleNext({ stability: 10, difficulty: 5, reps: 0, lapses: 0 }, 3);
    const b = scheduleNext({ stability: 10, difficulty: 5, reps: 99, lapses: 99 }, 3);
    expect(a).toEqual(b);
  });
});

describe("deriveGrade — 정답 여부/반응시간 → 1~4 등급 (engine/rating.ts 재사용)", () => {
  it("오답은 항상 1(again)", () => {
    expect(deriveGrade(false)).toBe(1);
    expect(deriveGrade(false, 1)).toBe(1);
  });

  it("정답이고 반응시간 정보가 없으면 3(good)", () => {
    expect(deriveGrade(true)).toBe(3);
  });

  it("정답이고 빠르면 4(easy), 느리면 3(good)", () => {
    expect(deriveGrade(true, 2)).toBe(4); // 2초 — 기본 임계값(4초) 이내
    expect(deriveGrade(true, 10)).toBe(3); // 10초 — 임계값 초과
  });
});
