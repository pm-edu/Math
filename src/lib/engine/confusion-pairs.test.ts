import { describe, expect, it } from "vitest";
import { detectConfusions, pickConfusionPartner } from "./confusion-pairs";

describe("detectConfusions — 오답 로그에서 혼동쌍을 집계한다", () => {
  it("MC형 문항에서 다른 단어의 뜻을 골랐으면 혼동으로 집계한다", () => {
    const result = detectConfusions([
      { wordId: "affect", chosenWordId: "effect", isCorrect: false },
      { wordId: "affect", chosenWordId: "effect", isCorrect: false },
    ]);
    expect(result).toEqual([{ wordId: "affect", confusedWithWordId: "effect", count: 2 }]);
  });

  it("정답인 경우는 집계하지 않는다", () => {
    const result = detectConfusions([{ wordId: "affect", chosenWordId: "effect", isCorrect: true }]);
    expect(result).toEqual([]);
  });

  it("주관식처럼 chosenWordId가 없는 경우는 집계하지 않는다(대상을 특정할 수 없음)", () => {
    const result = detectConfusions([{ wordId: "affect", chosenWordId: null, isCorrect: false }]);
    expect(result).toEqual([]);
  });

  it("자기 자신을 고른 것으로 기록되면(데이터 오류 방지) 집계하지 않는다", () => {
    const result = detectConfusions([{ wordId: "affect", chosenWordId: "affect", isCorrect: false }]);
    expect(result).toEqual([]);
  });

  it("서로 다른 쌍은 따로 집계한다", () => {
    const result = detectConfusions([
      { wordId: "affect", chosenWordId: "effect", isCorrect: false },
      { wordId: "accept", chosenWordId: "except", isCorrect: false },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("pickConfusionPartner — 콜드스타트: 개인화 없으면 시드로 대체", () => {
  it("개인화 혼동 이력이 있으면 그중 가장 많이 혼동한 단어를 고른다", () => {
    const personal = [
      { wordId: "affect", confusedWithWordId: "effect", count: 1 },
      { wordId: "affect", confusedWithWordId: "adopt", count: 5 },
    ];
    expect(pickConfusionPartner("affect", personal, [])).toBe("adopt");
  });

  it("개인화 이력이 없으면(신규 학생) 시드 혼동쌍으로 대체한다", () => {
    const seed = [{ wordId: "affect", confusedWithWordId: "effect" }];
    expect(pickConfusionPartner("affect", [], seed)).toBe("effect");
  });

  it("개인화도 시드도 없으면 null (이 단어는 대조 문항을 만들 수 없음)", () => {
    expect(pickConfusionPartner("banana", [], [])).toBeNull();
  });

  it("개인화 이력이 있으면 시드보다 우선한다", () => {
    const personal = [{ wordId: "affect", confusedWithWordId: "adopt", count: 1 }];
    const seed = [{ wordId: "affect", confusedWithWordId: "effect" }];
    expect(pickConfusionPartner("affect", personal, seed)).toBe("adopt");
  });
});
