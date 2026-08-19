import { describe, expect, it } from "vitest";
import { parseGeneratedJson } from "./item-generation";

describe("parseGeneratedJson — complete_the_words", () => {
  it("정상 응답을 파싱한다", () => {
    const json = JSON.stringify({
      items: [
        {
          paragraph: "The eco_omy grew.",
          blanks: [{ id: "b1", masked: "eco_omy", length: 7, answer: "economy" }],
          explanation_ko: "설명",
          skill_tags: ["vocab_in_context"],
        },
      ],
    });
    const result = parseGeneratedJson("complete_the_words", json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.kind).toBe("complete_the_words");
    if (result.result.kind !== "complete_the_words") return;
    expect(result.result.items).toHaveLength(1);
    expect(result.result.items[0].blanks[0].answer).toBe("economy");
  });

  it("잘못된 JSON이면 실패를 반환한다", () => {
    const result = parseGeneratedJson("complete_the_words", "not json");
    expect(result.ok).toBe(false);
  });

  it("items가 비어 있으면 실패를 반환한다", () => {
    const result = parseGeneratedJson("complete_the_words", JSON.stringify({ items: [] }));
    expect(result.ok).toBe(false);
  });
});

describe("parseGeneratedJson — choose_a_response", () => {
  it("옵션을 A~D 4개로 정규화하고 정답을 그중에서만 고른다", () => {
    const json = JSON.stringify({
      items: [
        {
          spoken_text: "Does the shuttle run tonight?",
          options: [{ text: "Yes" }, { text: "No" }, { text: "Maybe" }, { text: "Later" }],
          correct: ["Z", "B"], // Z는 존재하지 않는 id -> 무시, B만 유효
          explanation_ko: "설명",
          skill_tags: [],
        },
      ],
    });
    const result = parseGeneratedJson("choose_a_response", json);
    expect(result.ok).toBe(true);
    if (!result.ok || result.result.kind !== "choose_a_response") return;
    const item = result.result.items[0];
    expect(item.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(item.correct).toEqual(["B"]);
  });

  it("correct가 전부 무효하면 첫 번째 옵션으로 대체한다", () => {
    const json = JSON.stringify({
      items: [
        {
          spoken_text: "Hi",
          options: [{ text: "a" }, { text: "b" }],
          correct: ["Z"],
          explanation_ko: "설명",
          skill_tags: [],
        },
      ],
    });
    const result = parseGeneratedJson("choose_a_response", json);
    expect(result.ok).toBe(true);
    if (!result.ok || result.result.kind !== "choose_a_response") return;
    expect(result.result.items[0].correct).toEqual(["A"]);
  });
});

describe("parseGeneratedJson — mcq_passage(academic_passage 등)", () => {
  it("stimulus와 items를 함께 파싱한다", () => {
    const json = JSON.stringify({
      stimulus: { title: "Coral Reefs", text: "Coral reefs support..." },
      items: [
        {
          prompt: "What happens when corals bleach?",
          options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
          correct: ["B"],
          explanation_ko: "설명",
          skill_tags: ["inference"],
        },
      ],
    });
    const result = parseGeneratedJson("academic_passage", json);
    expect(result.ok).toBe(true);
    if (!result.ok || result.result.kind !== "mcq_passage") return;
    expect(result.result.stimulus.title).toBe("Coral Reefs");
    expect(result.result.items[0].correct).toEqual(["B"]);
  });

  it("stimulus.text가 비어 있으면 실패를 반환한다", () => {
    const json = JSON.stringify({ stimulus: { title: "t", text: "" }, items: [] });
    const result = parseGeneratedJson("academic_passage", json);
    expect(result.ok).toBe(false);
  });
});
