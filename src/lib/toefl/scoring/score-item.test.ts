import { describe, expect, it } from "vitest";
import { scoreItem, type ScoreableItem } from "./score-item";

describe("scoreItem — complete_the_words", () => {
  const item: ScoreableItem = {
    task_type: "complete_the_words",
    scoring_mode: "auto_key",
    points: 2,
    answer_key: { b1: "economy", b2: "introduced" },
  };

  it("대소문자·공백 무시하고 정답 인정", () => {
    const r = scoreItem(item, { answer: { b1: "  ECONOMY ", b2: "Introduced" } });
    expect(r.isCorrect).toBe(true);
    expect(r.pointsEarned).toBe(2);
  });

  it("blank 단위 부분점수", () => {
    const r = scoreItem(item, { answer: { b1: "economy", b2: "wrong" } });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(1); // 2개 중 1개 * 2점
  });

  it("무응답이면 0점", () => {
    const r = scoreItem(item, { answer: {} });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0);
  });
});

describe("scoreItem — mcq(단일 정답)", () => {
  const item: ScoreableItem = {
    task_type: "academic_passage",
    scoring_mode: "auto_key",
    points: 1,
    answer_key: { correct: ["B"] },
  };

  it("정답 선택", () => {
    const r = scoreItem(item, { answer: { selected: ["B"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("오답 선택", () => {
    const r = scoreItem(item, { answer: { selected: ["A"] } });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});

describe("scoreItem — multi_select 부분점수", () => {
  const item: ScoreableItem = {
    task_type: "academic_passage",
    scoring_mode: "auto_key",
    points: 1,
    answer_key: { correct: ["A", "B"] },
  };

  it("정답 2개 중 1개만 맞으면 0.5점", () => {
    const r = scoreItem(item, { answer: { selected: ["A"] } });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0.5);
  });

  it("2개 다 맞으면 만점", () => {
    const r = scoreItem(item, { answer: { selected: ["A", "B"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("오답을 추가로 골랐으면 만점 인정 안 함", () => {
    const r = scoreItem(item, { answer: { selected: ["A", "B", "C"] } });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(1); // matchedCount 2/2 비율은 만점이지만 오답 포함으로 isCorrect false
  });
});

describe("scoreItem — build_a_sentence", () => {
  const item: ScoreableItem = {
    task_type: "build_a_sentence",
    scoring_mode: "auto_sequence",
    points: 1,
    answer_key: { order: ["c1", "c2", "c3", "c4"], accepted_alternatives: [["c1", "c3", "c2", "c4"]] },
  };

  it("정확히 일치하면 정답", () => {
    const r = scoreItem(item, { answer: { order: ["c1", "c2", "c3", "c4"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("accepted_alternatives도 정답으로 인정", () => {
    const r = scoreItem(item, { answer: { order: ["c1", "c3", "c2", "c4"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("둘 다 아니면 오답", () => {
    const r = scoreItem(item, { answer: { order: ["c4", "c3", "c2", "c1"] } });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});

describe("scoreItem — listen_and_repeat(auto_transcript)", () => {
  const item: ScoreableItem = {
    task_type: "listen_and_repeat",
    scoring_mode: "auto_transcript",
    points: 1,
    answer_key: { target_sentence: "The museum will be closed for renovations next month." },
  };

  it("완전히 같은 문장이면 만점·정답", () => {
    const r = scoreItem(item, {
      answer: null,
      transcript: "The museum will be closed for renovations next month.",
    });
    expect(r.isCorrect).toBe(true);
    expect(r.pointsEarned).toBe(1);
  });

  it("무음/미응답은 0점", () => {
    const r = scoreItem(item, { answer: null, transcript: "" });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it("일부 단어만 맞으면 부분점수", () => {
    const r = scoreItem(item, { answer: null, transcript: "The museum will be closed" });
    expect(r.pointsEarned).toBeGreaterThan(0);
    expect(r.pointsEarned).toBeLessThan(1);
    expect(r.isCorrect).toBe(false);
  });
});

describe("scoreItem — ai_rubric은 자동채점 대상 아님", () => {
  it("take_an_interview는 항상 isCorrect null, 0점", () => {
    const item: ScoreableItem = {
      task_type: "take_an_interview",
      scoring_mode: "ai_rubric",
      points: 1,
      answer_key: null,
    };
    const r = scoreItem(item, { answer: null });
    expect(r).toEqual({ isCorrect: null, pointsEarned: 0 });
  });
});
