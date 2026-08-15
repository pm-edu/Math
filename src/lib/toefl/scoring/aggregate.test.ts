import { describe, expect, it } from "vitest";
import { aggregateRaw } from "./aggregate";

describe("aggregateRaw", () => {
  it("points_earned을 합산한다", () => {
    expect(aggregateRaw([{ points_earned: 1 }, { points_earned: 0.5 }, { points_earned: 2 }])).toBe(3.5);
  });

  it("null(미채점)은 0으로 취급", () => {
    expect(aggregateRaw([{ points_earned: 1 }, { points_earned: null }])).toBe(1);
  });

  it("빈 배열은 0", () => {
    expect(aggregateRaw([])).toBe(0);
  });
});
