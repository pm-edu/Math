import { describe, expect, it } from "vitest";
import { parseSpr } from "./spr";

describe("parseSpr", () => {
  it("parses a plain decimal", () => {
    const r = parseSpr("3.5");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ n: BigInt(7), d: BigInt(2) });
      expect(r.canonical).toBe("7/2");
    }
  });

  it("parses a fraction", () => {
    const r = parseSpr("7/2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(7), d: BigInt(2) });
  });

  it("parses a decimal with trailing zero the same as without", () => {
    const a = parseSpr("3.50");
    const b = parseSpr("3.5");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value).toEqual(b.value);
  });

  it("parses a leading-dot decimal", () => {
    const r = parseSpr(".5");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(1), d: BigInt(2) });
  });

  it("reduces a non-reduced fraction", () => {
    const r = parseSpr("6/4");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(3), d: BigInt(2) });
  });

  it("parses a negative decimal at the 6-char limit", () => {
    const r = parseSpr("-2.25");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(-9), d: BigInt(4) });
  });

  it("parses a simple fraction", () => {
    const r = parseSpr("1/3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(1), d: BigInt(3) });
  });

  it("rejects mixed numbers", () => {
    const r = parseSpr("3 1/2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MIXED_NUMBER_NOT_ALLOWED");
  });

  it("rejects commas", () => {
    const r = parseSpr("1,000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_CHAR");
  });

  it("rejects percent signs", () => {
    const r = parseSpr("50%");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_CHAR");
  });

  it("rejects input over the length limit", () => {
    const r = parseSpr("123456");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_LENGTH");
  });

  it("rejects division by zero", () => {
    const r = parseSpr("1/0");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("DIVISION_BY_ZERO");
  });

  it("rejects empty input", () => {
    const r = parseSpr("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EMPTY");
  });

  it("normalizes fullwidth digits via NFKC", () => {
    const r = parseSpr("０.５"); // "０.５"
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ n: BigInt(1), d: BigInt(2) });
  });

  it("rejects pi", () => {
    const r = parseSpr("3.14π");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_CHAR");
  });

  it("rejects a root sign", () => {
    const r = parseSpr("√2");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_CHAR");
  });

  it("rejects a dollar sign", () => {
    const r = parseSpr("$5");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_CHAR");
  });
});

describe("truncated-decimal grading rule (0.333 vs 0.33 against 1/3)", () => {
  it("0.333 is accepted as equal to 1/3 (fully-filled truncation/rounding)", async () => {
    const { isSprCorrect } = await import("./spr");
    const key = parseSpr("1/3");
    expect(key.ok).toBe(true);
    if (key.ok) expect(isSprCorrect("0.333", key.value)).toBe(true);
  });

  it("0.33 is NOT accepted as equal to 1/3 (grid not fully filled)", async () => {
    const { isSprCorrect } = await import("./spr");
    const key = parseSpr("1/3");
    expect(key.ok).toBe(true);
    if (key.ok) expect(isSprCorrect("0.33", key.value)).toBe(false);
  });

  it("still accepts an exact match regardless of fill (7/2 vs 3.5)", async () => {
    const { isSprCorrect } = await import("./spr");
    const key = parseSpr("7/2");
    expect(key.ok).toBe(true);
    if (key.ok) expect(isSprCorrect("3.5", key.value)).toBe(true);
  });
});
