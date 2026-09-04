import { describe, expect, it } from "vitest";
import { runGateA, mathSkillRequiresFigure } from "./gate-a";
import { findRealEntity } from "./real-entity-blocklist";

function validRw() {
  return {
    materialId: "m1",
    stimulus: {
      passageText: Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "),
    },
    question: {
      skill: "central_ideas",
      difficulty: 3,
      prompt: "What is the main idea of the passage?",
      choices: ["Choice one", "Choice two", "Choice three", "Choice four"],
      answerText: "Choice two",
      explanationKo: "정답은 Choice two 입니다. 지문 전체 맥락을 요약하기 때문입니다.",
    },
  };
}

function validMathMcq(overrides: Record<string, unknown> = {}) {
  return {
    difficulty: 3,
    format: "mcq",
    prompt: "What is $2 + 2$?",
    choices: ["3", "4", "5", "6"],
    answerText: "4",
    explanationKo: "정답은 4 입니다.",
    ...overrides,
  };
}

function validMathSpr(overrides: Record<string, unknown> = {}) {
  return {
    difficulty: 3,
    format: "spr",
    prompt: "What is 1/3 as a fraction in lowest terms?",
    sprAccepted: ["1/3"],
    explanationKo: "1을 3으로 나누면 1/3 입니다.",
    ...overrides,
  };
}

describe("Gate A1 — zod 스키마", () => {
  it("스키마를 통과하면 discardRules에 A1 없음", () => {
    const r = runGateA(validRw(), "rw");
    expect(r.discardRules).not.toContain("A1");
  });

  it("필수 필드가 없으면 A1 폐기", () => {
    const r = runGateA({ materialId: "m1" }, "rw");
    expect(r.verdict).toBe("discard");
    expect(r.discardRules).toEqual(["A1"]);
  });
});

describe("Gate A2 — RW 지문 25-150 단어", () => {
  it("25-150 단어면 통과", () => {
    const r = runGateA(validRw(), "rw");
    expect(r.discardRules).not.toContain("A2");
  });

  it("24단어 이하면 폐기", () => {
    const item = validRw();
    item.stimulus = { passageText: Array.from({ length: 10 }, (_, i) => `w${i}`).join(" ") };
    const r = runGateA(item, "rw");
    expect(r.discardRules).toContain("A2");
  });

  it("151단어 이상이면 폐기", () => {
    const item = validRw();
    item.stimulus = { passageText: Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ") };
    const r = runGateA(item, "rw");
    expect(r.discardRules).toContain("A2");
  });
});

describe("Gate A3 — 선택지 4개, 중복 없음", () => {
  it("중복 선택지가 있으면 폐기", () => {
    const item = validMathMcq({ choices: ["4", "4", "5", "6"] });
    const r = runGateA(item, "math");
    expect(r.discardRules).toContain("A3");
  });

  it("중복 없으면 통과", () => {
    const r = runGateA(validMathMcq(), "math");
    expect(r.discardRules).not.toContain("A3");
  });
});

describe("Gate A4 — 정답이 선택지 안에 존재", () => {
  it("정답 텍스트가 선택지에 없으면 폐기", () => {
    const item = validMathMcq({ answerText: "999" });
    const r = runGateA(item, "math");
    expect(r.discardRules).toContain("A4");
  });

  it("정답이 선택지 안에 있으면 통과", () => {
    const r = runGateA(validMathMcq(), "math");
    expect(r.discardRules).not.toContain("A4");
  });
});

describe("Gate A5 — SPR accepted가 P0 파서로 파싱됨", () => {
  it("파싱 불가능한 SPR 값이면 폐기", () => {
    const item = validMathSpr({ sprAccepted: ["3 1/2"] }); // 대분수 — parseSpr 실패
    const r = runGateA(item, "math");
    expect(r.discardRules).toContain("A5");
  });

  it("정상 SPR 값이면 통과", () => {
    const r = runGateA(validMathSpr(), "math");
    expect(r.discardRules).not.toContain("A5");
  });
});

describe("Gate A6 — $...$ 가 전부 KaTeX 컴파일됨", () => {
  it("깨진 LaTeX가 있으면 폐기", () => {
    const item = validMathMcq({ prompt: "Solve $\\frac{1}{$" });
    const r = runGateA(item, "math");
    expect(r.discardRules).toContain("A6");
  });

  it("유효한 LaTeX면 통과", () => {
    const r = runGateA(validMathMcq(), "math");
    expect(r.discardRules).not.toContain("A6");
  });

  it("수식이 없으면 통과(검사 대상 없음)", () => {
    const r = runGateA(validRw(), "rw");
    expect(r.discardRules).not.toContain("A6");
  });
});

describe("Gate A7 (보류) — 해설에 정답이 실제로 언급되는지", () => {
  it("MCQ 해설에 정답 텍스트가 없으면 보류", () => {
    const item = validMathMcq({ explanationKo: "이 문제는 계산 문제입니다." });
    const r = runGateA(item, "math");
    expect(r.holdRules).toContain("A7");
    expect(r.verdict).toBe("hold");
  });

  it("MCQ 해설에 정답 텍스트가 있으면 보류 아님", () => {
    const r = runGateA(validMathMcq(), "math");
    expect(r.holdRules).not.toContain("A7");
  });

  it("SPR 해설에 정답 값이 없으면 보류", () => {
    const item = validMathSpr({ explanationKo: "계산 과정은 생략합니다." });
    const r = runGateA(item, "math");
    expect(r.holdRules).toContain("A7");
  });

  it("SPR 해설에 동치 표현(0.333...)으로라도 정답 값이 있으면 보류 아님", () => {
    const item = validMathSpr({ sprAccepted: ["1/2"], explanationKo: "정답은 0.5 입니다." });
    const r = runGateA(item, "math");
    expect(r.holdRules).not.toContain("A7");
  });
});

describe("Gate A8 — 도형 스펙 → SVG 렌더 성공, 필수 스킬엔 도형 필수", () => {
  it("도형이 필요한 Math 스킬(circles)에 도형이 없으면 폐기", () => {
    const item = validMathMcq();
    const r = runGateA(item, "math", { mathSkill: "circles" });
    expect(r.discardRules).toContain("A8");
  });

  it("도형이 필요한 스킬에 유효한 도형이 있으면 통과", () => {
    const item = validMathMcq({ figure: { kind: "circle", center: { x: 0, y: 0 }, radius: 5 } });
    const r = runGateA(item, "math", { mathSkill: "circles" });
    expect(r.discardRules).not.toContain("A8");
  });

  it("RW command_of_evidence_quant는 도표 스펙 필수 — 없으면 폐기", () => {
    const item = validRw();
    item.question = { ...item.question, skill: "command_of_evidence_quant" };
    const r = runGateA(item, "rw");
    expect(r.discardRules).toContain("A8");
  });

  it("도형이 필요 없는 스킬은 없어도 통과", () => {
    const r = runGateA(validMathMcq(), "math", { mathSkill: "linear_functions" });
    expect(r.discardRules).not.toContain("A8");
  });

  it("mathSkillRequiresFigure가 geometry_trig/데이터 스킬만 true", () => {
    expect(mathSkillRequiresFigure("circles")).toBe(true);
    expect(mathSkillRequiresFigure("two_var_data_scatter")).toBe(true);
    expect(mathSkillRequiresFigure("one_var_data")).toBe(true);
    expect(mathSkillRequiresFigure("linear_functions")).toBe(false);
  });
});

describe("Gate A9 (보류) — 실존 인물·저작물 검출: 양성 5 / 음성 5", () => {
  const positives = [
    "Charles Darwin proposed the theory of natural selection.",
    "In Pride and Prejudice, the protagonist reconsiders her judgment.",
    "Marie Curie's research on radioactivity changed physics.",
    "Albert Einstein published his theory of relativity in 1905.",
    "Rachel Carson's Silent Spring warned of pesticide overuse.",
  ];
  const negatives = [
    "Dr. Elena Voss proposed a theory of adaptive resonance.",
    "In The Hollow Orchard, the protagonist reconsiders her judgment.",
    "Professor Aris Kade's research on bioluminescence changed marine biology.",
    "Dr. Mireille Tanaka published a paper on tidal energy in 2031.",
    "Nadia Ferro's The Quiet Continent warned of soil depletion.",
  ];

  it.each(positives)("실존 인물/저작물 문장은 탐지됨: %s", (text) => {
    expect(findRealEntity(text)).not.toBeNull();
  });

  it.each(negatives)("가상 인물/저작물 문장은 탐지 안 됨: %s", (text) => {
    expect(findRealEntity(text)).toBeNull();
  });

  it("실존 인물이 지문에 있으면 Gate A9 보류로 잡힘", () => {
    const item = validRw();
    item.stimulus = { passageText: `${item.stimulus.passageText} Charles Darwin studied this phenomenon closely for decades while at sea.` };
    const r = runGateA(item, "rw");
    expect(r.holdRules).toContain("A9");
  });

  it("전부 가상 인물이면 A9 안 걸림", () => {
    const r = runGateA(validRw(), "rw");
    expect(r.holdRules).not.toContain("A9");
  });
});

describe("종합 verdict", () => {
  it("아무 문제 없으면 insert", () => {
    const r = runGateA(validMathMcq(), "math", { mathSkill: "linear_functions" });
    expect(r.verdict).toBe("insert");
    expect(r.item).not.toBeNull();
  });

  it("폐기 규칙이 하나라도 있으면 discard고 item은 null", () => {
    const r = runGateA(validMathMcq({ choices: ["4", "4", "5", "6"] }), "math");
    expect(r.verdict).toBe("discard");
    expect(r.item).toBeNull();
  });

  it("보류 규칙만 있으면 hold고 item은 살아있음", () => {
    const item = validMathMcq({ explanationKo: "설명 없음." });
    const r = runGateA(item, "math");
    expect(r.verdict).toBe("hold");
    expect(r.item).not.toBeNull();
  });
});
