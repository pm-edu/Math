import { describe, expect, it } from "vitest";
import { gradeResponse, type AnswerKey } from "./grade";
import { parseSpr, type Rational } from "./spr";

function rat(raw: string): Rational {
  const r = parseSpr(raw);
  if (!r.ok) throw new Error(`fixture parse failed: ${raw}`);
  return r.value;
}

describe("gradeResponse — MCQ", () => {
  const key: AnswerKey = { type: "mcq", correct: "B" };

  it("marks the correct option as correct", () => {
    expect(gradeResponse(key, "B")).toEqual({ isCorrect: true, normalized: "B", errorCode: null });
  });

  it("marks a wrong option as incorrect", () => {
    const r = gradeResponse(key, "C");
    expect(r.isCorrect).toBe(false);
    expect(r.errorCode).toBeNull();
  });

  it("normalizes case", () => {
    expect(gradeResponse(key, "b").isCorrect).toBe(true);
  });
});

describe("gradeResponse — SPR", () => {
  const key: AnswerKey = { type: "spr", accepted: [rat("7/2")] };

  it("accepts an equivalent fraction", () => {
    const r = gradeResponse(key, "3.5");
    expect(r.isCorrect).toBe(true);
    expect(r.normalized).toBe("7/2");
    expect(r.errorCode).toBeNull();
  });

  it("accepts multiple accepted forms", () => {
    const multi: AnswerKey = { type: "spr", accepted: [rat("1/3")] };
    expect(gradeResponse(multi, "0.333").isCorrect).toBe(true);
    expect(gradeResponse(multi, "0.33").isCorrect).toBe(false);
  });

  it("rejects a wrong value", () => {
    expect(gradeResponse(key, "4").isCorrect).toBe(false);
  });

  it("records the SPR error code on invalid input instead of throwing", () => {
    const r = gradeResponse(key, "3 1/2");
    expect(r.isCorrect).toBe(false);
    expect(r.normalized).toBeNull();
    expect(r.errorCode).toBe("MIXED_NUMBER_NOT_ALLOWED");
  });

  it("accepts a value inside an authored tolerance range even if not in accepted[]", () => {
    const withTolerance: AnswerKey = {
      type: "spr",
      accepted: [rat("5")],
      tolerance: { min: rat("4.5"), max: rat("5.5") },
    };
    expect(gradeResponse(withTolerance, "4.8").isCorrect).toBe(true);
    expect(gradeResponse(withTolerance, "6").isCorrect).toBe(false);
  });
});
