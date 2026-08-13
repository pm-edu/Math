import { describe, expect, it } from "vitest";
import { generateContrast, gradeContrast } from "./contrast";

describe("generateContrast — 혼동쌍 대조 문항 생성", () => {
  it("빈칸 채운 문장 + 혼동쌍 두 단어를 보기로 준다", () => {
    const item = generateContrast({
      target: { lemma: "affect", exampleEn: "The weather can affect your mood." },
      confusedWith: { lemma: "effect" },
    });
    expect(item.prompt).toBe("The weather can _____ your mood.");
    expect(item.options.map((o) => o.key).sort()).toEqual(["affect", "effect"]);
    expect(item.correctKey).toBe("affect");
  });
});

describe("gradeContrast — 채점", () => {
  it("정답(문맥에 맞는 쪽)을 고르면 correct", () => {
    const item = generateContrast({
      target: { lemma: "affect", exampleEn: "The weather can affect your mood." },
      confusedWith: { lemma: "effect" },
    });
    const r = gradeContrast(item, { chosenKey: "affect", responseMs: 1000 });
    expect(r.isCorrect).toBe(true);
  });

  it("혼동 단어를 고르면 incorrect", () => {
    const item = generateContrast({
      target: { lemma: "affect", exampleEn: "The weather can affect your mood." },
      confusedWith: { lemma: "effect" },
    });
    const r = gradeContrast(item, { chosenKey: "effect", responseMs: 1000 });
    expect(r.isCorrect).toBe(false);
  });
});
