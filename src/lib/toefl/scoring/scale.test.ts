import { describe, expect, it } from "vitest";
import {
  applyRouteCap,
  bandDescription,
  bandToCefr,
  rawToScaled,
  scaledToBand,
  type BandLookupRow,
  type CefrLookupRow,
  type ScaleConversionRow,
} from "./scale";

// 실제 시드(202608151202 + 202608271200 보정)와 같은 11단계 곡선 — 구간이 이어지지 않으면
// rawToScaled가 이제 에러를 던지므로(2026-08-27 교차검증 A3) 테스트 데이터도 빈틈없이 맞춘다.
const ROWS: ScaleConversionRow[] = [
  { raw_min: 0, raw_max: 8, scaled: 0 },
  { raw_min: 8, raw_max: 17, scaled: 3 },
  { raw_min: 17, raw_max: 25, scaled: 6 },
  { raw_min: 25, raw_max: 33, scaled: 9 },
  { raw_min: 33, raw_max: 42, scaled: 12 },
  { raw_min: 42, raw_max: 50, scaled: 14 },
  { raw_min: 50, raw_max: 58, scaled: 17 },
  { raw_min: 58, raw_max: 67, scaled: 20 },
  { raw_min: 67, raw_max: 77, scaled: 23 },
  { raw_min: 77, raw_max: 90, scaled: 26 },
  { raw_min: 90, raw_max: 100, scaled: 30 }, // A2 수정: 이전엔 29였음(만점인데 30이 안 나오던 버그)
];

const BAND_ROWS: BandLookupRow[] = [
  { scaled: 0, band: 1.0 },
  { scaled: 3, band: 1.5 },
  { scaled: 6, band: 2.0 },
  { scaled: 9, band: 2.5 },
  { scaled: 12, band: 3.0 },
  { scaled: 14, band: 3.5 },
  { scaled: 17, band: 4.0 },
  { scaled: 20, band: 4.5 },
  { scaled: 23, band: 5.0 },
  { scaled: 26, band: 5.5 },
  { scaled: 30, band: 6.0 },
];

const CEFR_ROWS: CefrLookupRow[] = [
  { band: 1.0, cefr: "A1" },
  { band: 2.0, cefr: "A2" },
  { band: 3.0, cefr: "B1" },
  { band: 4.0, cefr: "B2" },
  { band: 5.0, cefr: "C1" },
  { band: 6.0, cefr: "C2" },
];

describe("rawToScaled", () => {
  it("구간 하한 포함(raw_min<=x)으로 버킷을 찾는다", () => {
    expect(rawToScaled(0, ROWS)).toBe(0);
    expect(rawToScaled(7.9, ROWS)).toBe(0);
    expect(rawToScaled(8, ROWS)).toBe(3);
    expect(rawToScaled(24.9, ROWS)).toBe(6);
  });

  it("100을 넘거나 0 미만이어도 clamp해서 처리", () => {
    expect(rawToScaled(150, ROWS)).toBe(30); // A2: 만점은 30이어야 한다(이전엔 29였음)
    expect(rawToScaled(-10, ROWS)).toBe(0);
  });

  it("행이 없으면 에러", () => {
    expect(() => rawToScaled(50, [])).toThrow();
  });

  it("구간에 공백이 있으면 에러(2026-08-27 A3 — raw_max를 실제로 검증에 쓴다)", () => {
    const gapped: ScaleConversionRow[] = [
      { raw_min: 0, raw_max: 8, scaled: 0 },
      { raw_min: 17, raw_max: 25, scaled: 6 }, // 8~17 구간이 빔
    ];
    expect(() => rawToScaled(10, gapped)).toThrow(/이어지지 않습니다/);
  });

  it("구간이 겹치면 에러", () => {
    const overlapping: ScaleConversionRow[] = [
      { raw_min: 0, raw_max: 10, scaled: 0 },
      { raw_min: 8, raw_max: 20, scaled: 3 }, // 8~10이 중첩
    ];
    expect(() => rawToScaled(15, overlapping)).toThrow(/이어지지 않습니다/);
  });
});

describe("scaledToBand", () => {
  it("spec §7 표대로 매핑(이제 DB에서 조회한 행을 받는다 — 2026-08-27 B1)", () => {
    expect(scaledToBand(0, BAND_ROWS)).toBe(1.0);
    expect(scaledToBand(17, BAND_ROWS)).toBe(4.0);
    expect(scaledToBand(19, BAND_ROWS)).toBe(4.0); // 다음 구간(20) 전까지는 이전 밴드 유지
    expect(scaledToBand(30, BAND_ROWS)).toBe(6.0);
  });

  it("행이 없으면 에러", () => {
    expect(() => scaledToBand(20, [])).toThrow();
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

describe("bandToCefr", () => {
  it("spec §7 표대로 매핑(이제 DB에서 조회한 행을 받는다 — 2026-08-27 B1)", () => {
    expect(bandToCefr(1.0, CEFR_ROWS)).toBe("A1");
    expect(bandToCefr(1.5, CEFR_ROWS)).toBe("A1");
    expect(bandToCefr(2.0, CEFR_ROWS)).toBe("A2");
    expect(bandToCefr(4.0, CEFR_ROWS)).toBe("B2");
    expect(bandToCefr(4.5, CEFR_ROWS)).toBe("B2");
    expect(bandToCefr(5.0, CEFR_ROWS)).toBe("C1");
    expect(bandToCefr(6.0, CEFR_ROWS)).toBe("C2");
  });

  it("범위를 벗어나도 clamp", () => {
    expect(bandToCefr(0, CEFR_ROWS)).toBe("A1");
    expect(bandToCefr(10, CEFR_ROWS)).toBe("C2");
  });

  it("행이 없으면 에러", () => {
    expect(() => bandToCefr(4.0, [])).toThrow();
  });
});

describe("bandDescription", () => {
  it("CEFR 등급에 맞는 설명을 돌려준다", () => {
    expect(bandDescription(4.5, CEFR_ROWS)).toMatch(/academic lectures/);
    expect(bandDescription(1.0, CEFR_ROWS)).toMatch(/basic phrases/);
  });

  it("정의되지 않은 등급은 없다(A1~C2 전부 매핑됨)", () => {
    for (let band = 1.0; band <= 6.0; band += 0.5) {
      expect(bandDescription(band, CEFR_ROWS)).toBeTruthy();
    }
  });
});
