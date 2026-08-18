import { describe, expect, it } from "vitest";
import { summarizeSkillTags } from "./skill-tags";

describe("summarizeSkillTags", () => {
  it("ignores tags with fewer than 2 samples", () => {
    const { weak, strong } = summarizeSkillTags([{ skillTags: ["inference"], isCorrect: false }]);
    expect(weak).toEqual([]);
    expect(strong).toEqual([]);
  });

  it("classifies a low-accuracy tag as weak", () => {
    const { weak } = summarizeSkillTags([
      { skillTags: ["inference"], isCorrect: false },
      { skillTags: ["inference"], isCorrect: false },
      { skillTags: ["inference"], isCorrect: true },
    ]);
    expect(weak).toEqual([{ tag: "inference", correct: 1, total: 3, accuracy: 1 / 3 }]);
  });

  it("classifies a high-accuracy tag as strong", () => {
    const { strong } = summarizeSkillTags([
      { skillTags: ["vocab_in_context"], isCorrect: true },
      { skillTags: ["vocab_in_context"], isCorrect: true },
      { skillTags: ["vocab_in_context"], isCorrect: true },
    ]);
    expect(strong).toEqual([{ tag: "vocab_in_context", correct: 3, total: 3, accuracy: 1 }]);
  });

  it("excludes unanswered/ungraded entries (isCorrect null) from the count", () => {
    const { weak, strong } = summarizeSkillTags([
      { skillTags: ["grammar"], isCorrect: null },
      { skillTags: ["grammar"], isCorrect: null },
    ]);
    expect(weak).toEqual([]);
    expect(strong).toEqual([]);
  });

  it("caps results at 3 tags each, sorted by accuracy", () => {
    const entries = ["a", "b", "c", "d"].flatMap((tag, i) => [
      { skillTags: [tag], isCorrect: false },
      { skillTags: [tag], isCorrect: i === 0 }, // tag "a" gets 1/2, rest get 0/2
    ]);
    const { weak } = summarizeSkillTags(entries);
    expect(weak).toHaveLength(3);
    expect(weak.map((w) => w.tag)).not.toContain("a"); // "a"(0.5) is the least weak, gets cut
  });

  it("a chunk can belong to multiple tags", () => {
    const { weak } = summarizeSkillTags([
      { skillTags: ["inference", "vocab_in_context"], isCorrect: false },
      { skillTags: ["inference"], isCorrect: false },
      { skillTags: ["vocab_in_context"], isCorrect: false },
    ]);
    expect(weak.find((w) => w.tag === "inference")).toEqual({ tag: "inference", correct: 0, total: 2, accuracy: 0 });
    expect(weak.find((w) => w.tag === "vocab_in_context")).toEqual({
      tag: "vocab_in_context",
      correct: 0,
      total: 2,
      accuracy: 0,
    });
  });
});
