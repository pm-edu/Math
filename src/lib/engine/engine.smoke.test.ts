import { describe, expect, it } from "vitest";

// Stage 0 인프라 점검용 스모크 테스트.
// Stage 2에서 fsrs.ts / mastery-level.ts / gate.ts / distractors.ts 실제 로직에
// 대한 단위 테스트로 대체·확장한다.
describe("vitest 인프라", () => {
  it("실행된다", () => {
    expect(1 + 1).toBe(2);
  });
});
