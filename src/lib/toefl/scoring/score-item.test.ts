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
  // format이 없거나(choose_a_response처럼 payload 자체에 format이 없는 유형) "mcq"/"insert_text"면
  // 단일 정답 취급이 기본값이다(score-item.ts scoreMcqLike 참고).
  const item: ScoreableItem = {
    task_type: "academic_passage",
    scoring_mode: "auto_key",
    points: 1,
    answer_key: { correct: ["B"] },
    payload: { format: "mcq", options: [] },
  };

  it("정답 선택", () => {
    const r = scoreItem(item, { answer: { selected: ["B"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("오답 선택", () => {
    const r = scoreItem(item, { answer: { selected: ["A"] } });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
  });

  it("payload가 없어도(choose_a_response 등) 단일 정답으로 채점", () => {
    const itemNoPayload: ScoreableItem = { ...item, payload: undefined };
    const r = scoreItem(itemNoPayload, { answer: { selected: ["B"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });
});

describe("scoreItem — insert_text(단일 정답, mcq와 같은 답안 형태)", () => {
  const item: ScoreableItem = {
    task_type: "academic_passage",
    scoring_mode: "auto_key",
    points: 1,
    answer_key: { correct: ["p2"] },
    payload: { format: "insert_text", options: [], insert_positions: ["p1", "p2", "p3"] },
  };

  it("정답 위치 선택", () => {
    const r = scoreItem(item, { answer: { selected: ["p2"] } });
    expect(r).toEqual({ isCorrect: true, pointsEarned: 1 });
  });

  it("다른 위치 선택은 오답", () => {
    const r = scoreItem(item, { answer: { selected: ["p1"] } });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
  });
});

describe("scoreItem — multi_select 부분점수(payload.format 기준)", () => {
  const item: ScoreableItem = {
    task_type: "academic_passage",
    scoring_mode: "auto_key",
    points: 1,
    answer_key: { correct: ["A", "B"] },
    payload: { format: "multi_select", options: [], select_count: 2 },
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

  it("오답을 추가로 고르면 그만큼 감점된다(2026-08-27 수정 — 예전엔 만점이 나가던 버그)", () => {
    const r = scoreItem(item, { answer: { selected: ["A", "B", "C"] } });
    expect(r.isCorrect).toBe(false);
    expect(r.pointsEarned).toBe(0.5); // 맞음 2 - 틀림 1 = 1, /정답개수 2 = 0.5
  });

  it("오답만 잔뜩 고르면 0점(음수로 내려가지 않음)", () => {
    const r = scoreItem(item, { answer: { selected: ["C", "D", "E"] } });
    expect(r).toEqual({ isCorrect: false, pointsEarned: 0 });
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

  it("목표 문장에 없는 단어를 덧붙여 말하면 감점된다(WER 삽입 오류, 2026-08-27 수정)", () => {
    const r = scoreItem(item, {
      answer: null,
      transcript: "Well actually The museum will be closed for renovations next month you know",
    });
    // 이전 LCS 방식이면 목표 문장이 순서대로 다 들어있어서 만점(1.0)이 나왔다 — 이제는 덧붙인
    // 5단어(well/actually/you/know 등)가 삽입 오류로 잡혀 감점된다.
    expect(r.pointsEarned).toBeLessThan(1);
    expect(r.pointsEarned).toBeGreaterThan(0);
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
