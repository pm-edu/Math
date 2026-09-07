import { describe, expect, it } from "vitest";
import { gradeAnswer } from "./grading";

const numericSpec = (value: string, extra: Record<string, unknown> = {}) => ({ value, tolerance: 0, accept: [], ...extra });

describe("gradeAnswer — numeric", () => {
  it("분수=소수: 3/4 ← 0.75", () => {
    expect(gradeAnswer("numeric", numericSpec("3/4"), "0.75").correct).toBe(true);
  });

  it("선행 0: 0.5 ← .5", () => {
    expect(gradeAnswer("numeric", numericSpec("0.5"), ".5").correct).toBe(true);
  });

  it("약분: 1/2 ← 2/4", () => {
    expect(gradeAnswer("numeric", numericSpec("1/2"), "2/4").correct).toBe(true);
  });

  it("공백: 12 ← ' 12 '", () => {
    expect(gradeAnswer("numeric", numericSpec("12"), " 12 ").correct).toBe(true);
  });

  it("부호: -3 ← '- 3'", () => {
    expect(gradeAnswer("numeric", numericSpec("-3"), "- 3").correct).toBe(true);
  });

  it("오답: 3/4 ← 4/3", () => {
    expect(gradeAnswer("numeric", numericSpec("3/4"), "4/3").correct).toBe(false);
  });

  it("잘못된 spec: {}", () => {
    const r = gradeAnswer("numeric", {}, "3/4");
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("invalid_spec");
  });

  it("0 처리: 0 ← -0", () => {
    expect(gradeAnswer("numeric", numericSpec("0"), "-0").correct).toBe(true);
  });

  it("accept 목록의 대체 표기도 정답으로 인정", () => {
    expect(gradeAnswer("numeric", numericSpec("3/4", { accept: [".75"] }), ".75").correct).toBe(true);
  });

  it("tolerance 범위 안이면 정답 (부동소수점 비교 없이 유리수 교차곱)", () => {
    expect(gradeAnswer("numeric", numericSpec("5", { tolerance: 0.5 }), "5.3").correct).toBe(true);
    expect(gradeAnswer("numeric", numericSpec("5", { tolerance: 0.5 }), "6").correct).toBe(false);
  });

  it("파싱 불가능한 제출값은 오답 + SPR 오류코드", () => {
    const r = gradeAnswer("numeric", numericSpec("3/4"), "3 1/2");
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("MIXED_NUMBER_NOT_ALLOWED");
  });
});

describe("gradeAnswer — mcq", () => {
  const spec = { choices: ["1", "2", "3", "4"], correct_index: 2 };

  it("정답 인덱스 일치", () => {
    expect(gradeAnswer("mcq", spec, "2").correct).toBe(true);
  });

  it("오답 인덱스", () => {
    expect(gradeAnswer("mcq", spec, "0").correct).toBe(false);
  });

  it("잘못된 spec", () => {
    const r = gradeAnswer("mcq", { choices: [] }, "0");
    expect(r.reason).toBe("invalid_spec");
  });
});

describe("gradeAnswer — expression", () => {
  const spec = { canonical: "2*x+1", vars: ["x"] };

  it("공백·대소문자 무시하고 일치", () => {
    expect(gradeAnswer("expression", spec, "2*X + 1").correct).toBe(true);
  });

  it("불일치", () => {
    expect(gradeAnswer("expression", spec, "2*x+2").correct).toBe(false);
  });
});

describe("gradeAnswer — free", () => {
  it("항상 manual_required, correct=false", () => {
    const r = gradeAnswer("free", { rubric_ko: "..." }, "아무 답");
    expect(r.correct).toBe(false);
    expect(r.reason).toBe("manual_required");
  });
});
