import { describe, expect, it } from "vitest";
import { getGenerator } from "./registry";
import { responseWindowFor } from "./speaking";

// 이 다섯 유형은 앞의 일곱과 두 가지가 다르다:
//   1) ai_rubric 유형은 정답이 없다 → answerKey 가 null 이어야 한다.
//   2) 학생이 "들어야/맞춰야" 하는 값이 payload 에 남는다 → 화면으로 내려가면 시험이 깨진다.
// 그래서 아래 테스트의 절반은 "무엇이 payload 에 없어야 하는가"를 본다.

describe("listen_and_repeat", () => {
  const g = getGenerator("listen_and_repeat")!;

  it("따라 말할 문장을 정답과 음성 양쪽에 넘긴다", () => {
    const row = g.toItemRow({
      target_sentence: "The library closes early on Friday.",
      context: "You are asking about library hours.",
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.answerKey).toEqual({ target_sentence: "The library closes early on Friday." });
    // TTS 로 음성을 만들어야 하므로 spokenText 로도 넘어간다.
    expect(row.spokenText).toBe("The library closes early on Friday.");
    // 화면 지시문에는 문장이 들어가면 안 된다 — 읽어버리면 듣기 시험이 아니게 된다.
    expect(row.prompt).not.toContain("library closes");
  });

  it("문장 길이에 따라 응답 시간이 8/10/12초로 갈린다", () => {
    expect(responseWindowFor("The bus is late.")).toBe(8);
    expect(responseWindowFor("The shuttle to the north campus runs every twenty minutes.")).toBe(10);
    expect(responseWindowFor("If you cannot attend the session this week, please send a message to the instructor beforehand.")).toBe(12);
  });

  it("문장이 비면 저장하지 않는다", () => {
    expect(g.toItemRow({ target_sentence: "  ", explanation_ko: "설명", skill_tags: [] }).ok).toBe(false);
  });
});

describe("take_an_interview", () => {
  const g = getGenerator("take_an_interview")!;
  const draft = {
    question_text: "Which do you think works better, studying alone or in groups?",
    turn_type: "opinion",
    explanation_ko: "설명",
    skill_tags: [],
  };

  it("루브릭 채점이라 정답이 없다", () => {
    const row = g.toItemRow(draft);
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.answerKey).toBeNull();
    expect(g.scoringMode).toBe("ai_rubric");
  });

  it("질문은 음성으로만 전달한다 — 지시문에 질문이 들어가지 않는다", () => {
    const row = g.toItemRow(draft);
    if (!row.ok) return;
    expect(row.prompt).not.toContain("studying alone");
    expect(row.spokenText).toBe(draft.question_text);
  });

  it("turn_type 이 이상하면 opinion 으로 떨어진다", () => {
    const parsed = g.parse({ items: [{ question_text: "Q?", turn_type: "무엇", explanation_ko: "x", skill_tags: [] }] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items[0].turn_type).toBe("opinion");
  });
});

describe("build_a_sentence", () => {
  const g = getGenerator("build_a_sentence")!;
  const chunks = [
    { id: "c1", text: "Could you tell me" },
    { id: "c2", text: "when the maintenance team" },
    { id: "c3", text: "will visit" },
    { id: "c4", text: "my room" },
  ];

  it("정답 순서는 answer_key 에만 두고 payload 에는 조각만 넣는다", () => {
    const row = g.toItemRow({
      chunks,
      order: ["c1", "c2", "c3", "c4"],
      accepted_alternatives: [],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.answerKey).toEqual({ order: ["c1", "c2", "c3", "c4"], accepted_alternatives: [] });
    // payload 에 order 가 있으면 정답이 그대로 보인다.
    expect(row.payload).not.toHaveProperty("order");
    const payloadIds = (row.payload.chunks as { id: string }[]).map((c) => c.id).sort();
    expect(payloadIds).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("정답 순서가 조각과 안 맞으면 저장하지 않는다", () => {
    // 조각은 4개인데 순서는 3개 — 채점이 성립하지 않는다.
    expect(
      g.toItemRow({ chunks, order: ["c1", "c2", "c3"], explanation_ko: "설명", skill_tags: [] }).ok
    ).toBe(false);
    // 같은 조각이 두 번 들어간 순서도 거른다.
    expect(
      g.toItemRow({ chunks, order: ["c1", "c1", "c3", "c4"], explanation_ko: "설명", skill_tags: [] }).ok
    ).toBe(false);
  });

  it("파싱 단계에서 조각에 없는 id 는 순서에서 걸러낸다", () => {
    const parsed = g.parse({
      items: [{ chunks, order: ["c1", "zz", "c2", "c3", "c4"], explanation_ko: "x", skill_tags: [] }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items[0].order).toEqual(["c1", "c2", "c3", "c4"]);
  });
});

describe("write_an_email", () => {
  const g = getGenerator("write_an_email")!;

  it("정답 없이 시나리오와 요구사항·글자수만 담는다", () => {
    const row = g.toItemRow({
      scenario: "Write an e-mail to your lab instructor.",
      required_points: ["결석 알리기", "사유 설명", "보강 제안"],
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.answerKey).toBeNull();
    expect(row.payload.word_min).toBe(100);
    expect(row.payload.word_max).toBe(130);
    expect(row.payload.required_points).toHaveLength(3);
  });

  it("요구사항이 없으면 저장하지 않는다", () => {
    expect(g.toItemRow({ scenario: "상황", required_points: [], explanation_ko: "설명", skill_tags: [] }).ok).toBe(false);
  });
});

describe("academic_discussion", () => {
  const g = getGenerator("academic_discussion")!;
  const posts = [
    { name: "Marco", text: "Pedestrian zones help small shops." },
    { name: "Lena", text: "Deliveries depend on car access." },
  ];

  it("교수 글과 학생 댓글을 payload 에 담고 정답은 없다", () => {
    const row = g.toItemRow({
      professor_post: "Do the benefits outweigh the drawbacks?",
      student_posts: posts,
      explanation_ko: "설명",
      skill_tags: [],
    });
    expect(row.ok).toBe(true);
    if (!row.ok) return;
    expect(row.answerKey).toBeNull();
    expect(row.payload.student_posts).toHaveLength(2);
    expect(row.payload.word_max).toBe(150);
  });

  it("학생 댓글이 2개 미만이면 저장하지 않는다", () => {
    expect(
      g.toItemRow({ professor_post: "질문", student_posts: [posts[0]], explanation_ko: "설명", skill_tags: [] }).ok
    ).toBe(false);
  });

  it("이름이나 내용이 빈 댓글은 파싱에서 걸러낸다", () => {
    const parsed = g.parse({
      items: [
        {
          professor_post: "Q",
          student_posts: [...posts, { name: "", text: "이름 없음" }, { name: "Kim", text: "" }],
          explanation_ko: "x",
          skill_tags: [],
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.items[0].student_posts).toHaveLength(2);
  });
});
