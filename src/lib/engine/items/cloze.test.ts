import { describe, expect, it } from "vitest";
import { generateCloze, gradeCloze } from "./cloze";

describe("generateCloze — 문맥 빈칸 채우기(Lv3) 문항 생성", () => {
  it("예문에서 단어를 빈칸으로 바꾼다", () => {
    const item = generateCloze({ lemma: "affect", exampleEn: "The weather can affect your mood." });
    expect(item.prompt).toBe("The weather can _____ your mood.");
    expect(item.prompt).not.toContain("affect");
  });

  it("대소문자와 무관하게 단어를 찾아 가린다 (문장 맨 앞의 대문자 등)", () => {
    const item = generateCloze({ lemma: "affect", exampleEn: "Affect is the keyword here." });
    expect(item.prompt).toBe("_____ is the keyword here.");
  });

  it("단어의 일부만 포함된 다른 단어는 가리지 않는다 (예: cat vs concatenate)", () => {
    const item = generateCloze({ lemma: "cat", exampleEn: "The cat sat on the concatenated mat." });
    expect(item.prompt).toBe("The _____ sat on the concatenated mat.");
  });

  it("정답(lemma)을 채점용으로 담고 있다", () => {
    const item = generateCloze({ lemma: "affect", exampleEn: "The weather can affect your mood." });
    expect(item.correctAnswer).toBe("affect");
  });
});

describe("gradeCloze — 채점(rating.gradeTyped 재사용)", () => {
  it("정확히 입력하면 정답", () => {
    const item = generateCloze({ lemma: "affect", exampleEn: "The weather can affect your mood." });
    const r = gradeCloze(item, { typed: "affect", responseMs: 1000 });
    expect(r.isCorrect).toBe(true);
  });
});
