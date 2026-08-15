import { describe, expect, it } from "vitest";
import { aiRubricToPoints } from "./ai-rubric";

describe("aiRubricToPoints", () => {
  it("band 6.0(만점)이면 배점 전부", () => {
    expect(aiRubricToPoints(6.0, 1)).toBe(1);
  });

  it("band 3.0이면 절반", () => {
    expect(aiRubricToPoints(3.0, 1)).toBe(0.5);
  });

  it("band 0이면 0점", () => {
    expect(aiRubricToPoints(0, 1)).toBe(0);
  });

  it("범위를 벗어나도 0~만점으로 clamp", () => {
    expect(aiRubricToPoints(9, 2)).toBe(2);
    expect(aiRubricToPoints(-1, 2)).toBe(0);
  });
});
