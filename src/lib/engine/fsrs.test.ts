import { describe, expect, it } from "vitest";
import { scheduleNext, daysBetween, type FsrsState } from "./fsrs";

const NOW = new Date("2026-08-13T00:00:00.000Z");

describe("scheduleNext — FSRS(언제 복습할지) 계산", () => {
  it("첫 복습(이전 상태 없음)에서 again은 아주 짧은 간격을 준다", () => {
    const next = scheduleNext(null, "again", NOW);
    expect(daysBetween(NOW, new Date(next.dueAt))).toBeLessThanOrEqual(1);
  });

  it("첫 복습에서 easy가 good보다 더 긴 간격을 준다", () => {
    const good = scheduleNext(null, "good", NOW);
    const easy = scheduleNext(null, "easy", NOW);
    expect(daysBetween(NOW, new Date(easy.dueAt))).toBeGreaterThan(
      daysBetween(NOW, new Date(good.dueAt))
    );
  });

  it("again은 stability를 큰 폭으로 무너뜨린다", () => {
    const prev: FsrsState = { stability: 30, difficulty: 5, dueAt: NOW.toISOString() };
    const next = scheduleNext(prev, "again", NOW);
    expect(next.stability).toBeLessThan(prev.stability / 2);
  });

  it("easy를 반복하면 stability가 계속 커진다(간격이 점점 벌어진다)", () => {
    let state: FsrsState | null = null;
    let prevStability = 0;
    for (let i = 0; i < 4; i++) {
      state = scheduleNext(state, "easy", NOW);
      expect(state.stability).toBeGreaterThan(prevStability);
      prevStability = state.stability;
    }
  });

  it("difficulty는 1~10 범위를 벗어나지 않는다 (계속 again을 줘도, easy를 줘도)", () => {
    let state: FsrsState | null = null;
    for (let i = 0; i < 20; i++) state = scheduleNext(state, "again", NOW);
    expect(state!.difficulty).toBeLessThanOrEqual(10);
    expect(state!.difficulty).toBeGreaterThanOrEqual(1);

    let state2: FsrsState | null = null;
    for (let i = 0; i < 20; i++) state2 = scheduleNext(state2, "easy", NOW);
    expect(state2!.difficulty).toBeGreaterThanOrEqual(1);
    expect(state2!.difficulty).toBeLessThanOrEqual(10);
  });

  it("easy를 아주 많이 반복해도 stability에는 상한이 있다 (무한정 커지지 않는다)", () => {
    let state: FsrsState | null = null;
    for (let i = 0; i < 50; i++) state = scheduleNext(state, "easy", NOW);
    expect(Number.isFinite(state!.stability)).toBe(true);
    expect(state!.stability).toBeLessThanOrEqual(365 * 5);
    expect(Number.isNaN(new Date(state!.dueAt).getTime())).toBe(false);
  });

  it("dueAt은 항상 now 이후 시각이다", () => {
    const next = scheduleNext(null, "again", NOW);
    expect(new Date(next.dueAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("hard는 good보다 간격 성장이 작다(둘 다 이전 상태 있을 때)", () => {
    const prev: FsrsState = { stability: 10, difficulty: 5, dueAt: NOW.toISOString() };
    const hard = scheduleNext(prev, "hard", NOW);
    const good = scheduleNext(prev, "good", NOW);
    expect(hard.stability).toBeLessThan(good.stability);
  });
});
