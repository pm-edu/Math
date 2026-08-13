import { describe, expect, it } from "vitest";
import { blankOut } from "./shared";

describe("blankOut — 예문에서 단어를 찾아 빈칸으로 바꾼다", () => {
  it("정확히 같은 형태면 빈칸으로 바꾼다", () => {
    expect(blankOut("The weather can affect your mood.", "affect")).toBe("The weather can _____ your mood.");
  });

  it("규칙활용(-ed)까지 찾아서 빈칸으로 바꾼다 (accept → accepted)", () => {
    expect(blankOut("She accepted the job offer.", "accept")).toBe("She _____ the job offer.");
  });

  it("규칙활용(-d, 원형이 e로 끝남)까지 찾는다 (arrive → arrived)", () => {
    expect(blankOut("We arrived at the airport.", "arrive")).toBe("We _____ at the airport.");
  });

  it("규칙활용(-s)까지 찾는다 (complement → complements)", () => {
    expect(blankOut("The wine complements the meal.", "complement")).toBe("The wine _____ the meal.");
  });

  it("찾을 수 없으면(불규칙 활용 등) null을 반환한다 — 호출자가 다른 문항으로 대체해야 함", () => {
    expect(blankOut("He denied breaking the window.", "deny")).toBeNull();
  });

  it("단어의 일부만 포함된 다른 단어는 가리지 않는다 (cat vs concatenated)", () => {
    expect(blankOut("The cat sat on the concatenated mat.", "cat")).toBe("The _____ sat on the concatenated mat.");
  });
});
