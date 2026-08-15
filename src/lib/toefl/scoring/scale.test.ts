import { describe, expect, it } from "vitest";
import { applyRouteCap, rawToScaled, scaledToBand, type ScaleConversionRow } from "./scale";

const ROWS: ScaleConversionRow[] = [
  { raw_min: 0, raw_max: 8, scaled: 0 },
  { raw_min: 8, raw_max: 17, scaled: 3 },
  { raw_min: 17, raw_max: 25, scaled: 6 },
  { raw_min: 90, raw_max: 100, scaled: 29 },
];

describe("rawToScaled", () => {
  it("구간 하한 포함(raw_min<=x)으로 버킷을 찾는다", () => {
    expect(rawToScaled(0, ROWS)).toBe(0);
    expect(rawToScaled(7.9, ROWS)).toBe(0);
    expect(rawToScaled(8, ROWS)).toBe(3);
    expect(rawToScaled(24.9, ROWS)).toBe(6);
  });

  it("100을 넘거나 0 미만이어도 clamp해서 처리", () => {
    expect(rawToScaled(150, ROWS)).toBe(29);
    expect(rawToScaled(-10, ROWS)).toBe(0);
  });

  it("행이 없으면 에러", () => {
    expect(() => rawToScaled(50, [])).toThrow();
  });
});

describe("scaledToBand", () => {
  it("spec §7 표대로 매핑", () => {
    expect(scaledToBand(0)).toBe(1.0);
    expect(scaledToBand(17)).toBe(4.0);
    expect(scaledToBand(19)).toBe(4.0); // 다음 구간(20) 전까지는 이전 밴드 유지
    expect(scaledToBand(29)).toBe(6.0);
    expect(scaledToBand(30)).toBe(6.0);
  });
});

describe("applyRouteCap", () => {
  it("easy 경로는 4.0 상한", () => {
    expect(applyRouteCap(5.0, "easy")).toBe(4.0);
    expect(applyRouteCap(3.0, "easy")).toBe(3.0);
  });

  it("hard/base 경로는 그대로", () => {
    expect(applyRouteCap(5.0, "hard")).toBe(5.0);
    expect(applyRouteCap(6.0, "base")).toBe(6.0);
  });
});
