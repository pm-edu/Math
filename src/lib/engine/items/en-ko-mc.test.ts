import { describe, expect, it } from "vitest";
import { generateEnKoMc, gradeEnKoMc } from "./en-ko-mc";
import type { DistractorCandidate } from "../distractors";

type Sense = { id: string; meaning: string };

function s(id: string, meaning: string, isConfusion = false): DistractorCandidate<Sense> {
  return { item: { id, meaning }, key: meaning, isConfusion };
}

describe("generateEnKoMc — 영→한 4지선다(Lv1) 문항 생성", () => {
  it("보기 4개(정답 1 + 오답 3)를 만든다", () => {
    const pool = [s("a", "받아들이다"), s("b", "제외하고"), s("c", "고용하다"), s("d", "판단하다")];
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, pool);
    expect(item.options).toHaveLength(4);
    expect(item.options.map((o) => o.label)).toContain("영향을 미치다");
  });

  it("문제 지문은 영어 단어(lemma)다", () => {
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, [s("a", "받아들이다")]);
    expect(item.prompt).toBe("affect");
  });

  it("정답 옵션의 key가 correctKey와 일치한다", () => {
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, [s("a", "받아들이다")]);
    const correctOption = item.options.find((o) => o.key === item.correctKey);
    expect(correctOption?.label).toBe("영향을 미치다");
  });

  it("보기 후보가 3개 미만이면 있는 만큼만(4개 미만) 만든다", () => {
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, [s("a", "받아들이다")]);
    expect(item.options.length).toBe(2); // 정답 1 + 오답 1
  });
});

describe("gradeEnKoMc — 채점", () => {
  it("정답을 고르면 correct", () => {
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, [s("a", "받아들이다")]);
    const result = gradeEnKoMc(item, { chosenKey: item.correctKey, responseMs: 1000 });
    expect(result.isCorrect).toBe(true);
  });

  it("오답을 고르면 incorrect (rating=again)", () => {
    const item = generateEnKoMc({ lemma: "affect", meaning: "영향을 미치다" }, [s("a", "받아들이다")]);
    const wrong = item.options.find((o) => o.key !== item.correctKey)!;
    const result = gradeEnKoMc(item, { chosenKey: wrong.key, responseMs: 1000 });
    expect(result.isCorrect).toBe(false);
    expect(result.rating).toBe("again");
  });
});
