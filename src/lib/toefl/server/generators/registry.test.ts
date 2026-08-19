import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/prompts.json";
import { GENERATOR_LIST, generatorsForSection, getGenerator } from "./registry";
import { GENERATABLE_TASKS, TASK_CATALOG, catalogEntry } from "@/lib/toefl/task-catalog";

// 이 파일의 핵심은 첫 describe다. 리팩터(유형별 생성기로 쪼개기) 전에 만들어둔 프롬프트
// 스냅샷과 지금 결과가 한 글자도 다르지 않은지 본다 — 프롬프트가 바뀌면 AI 출력이 바뀌고,
// 그건 "구조만 정리했다"는 말이 거짓이 된다는 뜻이다.
describe("프롬프트가 리팩터 전과 동일하다", () => {
  const cases = Object.keys(fixture as Record<string, string>);

  it("스냅샷이 7개 유형 × 2가지 조건을 덮는다", () => {
    expect(cases).toHaveLength(14);
    expect(GENERATOR_LIST).toHaveLength(7);
  });

  for (const key of cases) {
    it(key, () => {
      const noTopic = key.endsWith("__no-topic-d5");
      const taskType = noTopic ? key.replace("__no-topic-d5", "") : key;
      const g = getGenerator(taskType);
      expect(g, `생성기 없음: ${taskType}`).not.toBeNull();
      const actual = noTopic
        ? g!.buildPrompt({ itemsPerUnit: 1, difficulty: 5 })
        : g!.buildPrompt({ itemsPerUnit: 4, topic: "campus life", difficulty: 3 });
      expect(actual).toBe((fixture as Record<string, string>)[key]);
    });
  }
});

describe("카탈로그와 레지스트리가 어긋나지 않는다", () => {
  it("generatable로 표시된 유형은 전부 생성기가 있다", () => {
    for (const e of GENERATABLE_TASKS) {
      expect(getGenerator(e.taskType), `생성기 없음: ${e.taskType}`).not.toBeNull();
    }
  });

  it("생성기가 있는 유형은 전부 카탈로그에 generatable로 표시돼 있다", () => {
    for (const g of GENERATOR_LIST) {
      expect(catalogEntry(g.taskType)?.generatable, `카탈로그 불일치: ${g.taskType}`).toBe(true);
    }
  });

  it("생성기의 메타데이터는 카탈로그 값을 그대로 쓴다", () => {
    for (const g of GENERATOR_LIST) {
      const e = catalogEntry(g.taskType)!;
      expect({ section: g.section, label: g.label, needsStimulus: g.needsStimulus }).toEqual({
        section: e.section,
        label: e.label,
        needsStimulus: e.needsStimulus,
      });
    }
  });

  it("카탈로그는 12개 유형 전부를 담는다", () => {
    expect(TASK_CATALOG).toHaveLength(12);
    expect(new Set(TASK_CATALOG.map((e) => e.taskType)).size).toBe(12);
  });

  it("아직 생성기가 없는 5종은 Speaking 2 · Writing 3 이다", () => {
    const pending = TASK_CATALOG.filter((e) => !e.generatable).map((e) => e.taskType);
    expect(pending).toEqual([
      "listen_and_repeat",
      "take_an_interview",
      "build_a_sentence",
      "write_an_email",
      "academic_discussion",
    ]);
  });
});

describe("영역별 조회", () => {
  it("Reading 3종 · Listening 4종", () => {
    expect(generatorsForSection("reading").map((g) => g.taskType)).toEqual([
      "complete_the_words",
      "daily_life",
      "academic_passage",
    ]);
    expect(generatorsForSection("listening").map((g) => g.taskType)).toEqual([
      "choose_a_response",
      "conversation",
      "announcement",
      "academic_talk",
    ]);
  });

  it("생성기가 없는 영역은 빈 배열", () => {
    expect(generatorsForSection("speaking")).toEqual([]);
    expect(generatorsForSection("writing")).toEqual([]);
  });
});

describe("toItemRow — 저장 형태", () => {
  it("빈칸 유형은 정답을 payload에 넣지 않는다 (학생에게 그대로 내려가는 칸)", () => {
    const row = getGenerator("complete_the_words")!.toItemRow({
      paragraph: "The eco_omy grew.",
      blanks: [{ id: "b1", masked: "eco_omy", length: 7, answer: "economy" }],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(JSON.stringify(row.payload)).not.toContain("economy");
    expect(row.answerKey).toEqual({ b1: "economy" });
  });

  it("응답 고르기 유형은 들려줄 문장을 payload에 넣지 않는다 (듣기 전 노출 금지)", () => {
    const row = getGenerator("choose_a_response")!.toItemRow({
      spoken_text: "Does the shuttle run tonight?",
      options: [
        { id: "A", text: "Yes" },
        { id: "B", text: "No" },
      ],
      correct: ["A"],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(JSON.stringify(row.payload)).not.toContain("shuttle");
    expect(row.spokenText).toBe("Does the shuttle run tonight?");
  });

  it("보기가 부족하면 저장하지 않고 이유를 돌려준다", () => {
    const row = getGenerator("academic_passage")!.toItemRow({
      prompt: "질문",
      options: [{ id: "A", text: "하나뿐" }],
      correct: ["A"],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(false);
  });

  it("지문 공유 유형은 문항 자체의 질문을 prompt로 쓴다", () => {
    const row = getGenerator("conversation")!.toItemRow({
      prompt: "What does the advisor suggest?",
      options: [
        { id: "A", text: "a" },
        { id: "B", text: "b" },
      ],
      correct: ["B"],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.prompt).toBe("What does the advisor suggest?");
    expect(row.spokenText).toBeNull();
  });
});
