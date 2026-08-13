import { describe, expect, it } from "vitest";
import { generateKoEnTyping, gradeKoEnTyping } from "./ko-en-typing";

describe("generateKoEnTyping — 뜻 보고 영어 타이핑(Lv2) 문항 생성", () => {
  it("문제 지문은 뜻이다", () => {
    const item = generateKoEnTyping({ lemma: "effect", meaning: "영향, 결과" });
    expect(item.prompt).toBe("영향, 결과");
  });

  it("정답(lemma)을 채점용으로 담고 있다", () => {
    const item = generateKoEnTyping({ lemma: "effect", meaning: "영향, 결과" });
    expect(item.correctAnswer).toBe("effect");
  });
});

describe("gradeKoEnTyping — 채점(rating.gradeTyped 재사용)", () => {
  it("정확히 입력하면 정답", () => {
    const item = generateKoEnTyping({ lemma: "effect", meaning: "영향, 결과" });
    const r = gradeKoEnTyping(item, { typed: "effect", responseMs: 1000 });
    expect(r.isCorrect).toBe(true);
  });

  it("완전히 틀린 답은 오답", () => {
    const item = generateKoEnTyping({ lemma: "effect", meaning: "영향, 결과" });
    const r = gradeKoEnTyping(item, { typed: "banana", responseMs: 1000 });
    expect(r.isCorrect).toBe(false);
  });
});
