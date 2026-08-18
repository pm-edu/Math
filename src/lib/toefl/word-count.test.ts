import { describe, expect, it } from "vitest";
import { wordCount } from "./word-count";

describe("wordCount", () => {
  it("counts words separated by whitespace", () => {
    expect(wordCount("The committee approved the plan")).toBe(5);
  });

  it("returns 0 for empty or whitespace-only text", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
  });

  it("collapses multiple spaces/newlines between words", () => {
    expect(wordCount("one  two\n\nthree")).toBe(3);
  });

  it("ignores leading/trailing whitespace", () => {
    expect(wordCount("  hello world  ")).toBe(2);
  });
});
