import { describe, expect, it } from "vitest";
import { levenshtein } from "./levenshtein";

describe("levenshtein", () => {
  it("동일한 문자열은 거리 0", () => {
    expect(levenshtein("apple", "apple")).toBe(0);
  });

  it("한 글자 다르면 거리 1", () => {
    expect(levenshtein("apple", "appla")).toBe(1);
  });

  it("한 글자 빠지면 거리 1", () => {
    expect(levenshtein("apple", "aple")).toBe(1);
  });

  it("한 글자 더 있으면 거리 1", () => {
    expect(levenshtein("apple", "appple")).toBe(1);
  });

  it("완전히 다른 단어는 거리가 크다", () => {
    expect(levenshtein("cat", "dog")).toBeGreaterThanOrEqual(3);
  });

  it("대소문자를 구분한다 (정규화는 호출자 책임)", () => {
    expect(levenshtein("Apple", "apple")).toBe(1);
  });

  it("빈 문자열과의 거리는 상대 문자열 길이", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});
