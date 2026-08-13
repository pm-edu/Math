import { describe, expect, it } from "vitest";
import { deriveRating, gradeTyped, DEFAULT_FAST_THRESHOLD_MS } from "./rating";

describe("deriveRating — 정답/오답/속도/근접오타에서 등급을 자동 산출한다", () => {
  it("오답이면 무조건 again", () => {
    expect(deriveRating({ isCorrect: false, responseMs: 500 })).toBe("again");
    expect(deriveRating({ isCorrect: false, responseMs: 999999 })).toBe("again");
  });

  it("정답+근접오타(오타 허용)면 hard — 정답이지만 아직 철자가 완전하지 않다", () => {
    expect(deriveRating({ isCorrect: true, responseMs: 500, nearMiss: true })).toBe("hard");
  });

  it("정답+빠르면 easy", () => {
    expect(
      deriveRating({ isCorrect: true, responseMs: DEFAULT_FAST_THRESHOLD_MS - 1 })
    ).toBe("easy");
  });

  it("정답+느리면 good", () => {
    expect(
      deriveRating({ isCorrect: true, responseMs: DEFAULT_FAST_THRESHOLD_MS + 1 })
    ).toBe("good");
  });

  it("반응시간이 없으면(측정 불가) good으로 보수적으로 처리", () => {
    expect(deriveRating({ isCorrect: true, responseMs: undefined })).toBe("good");
  });

  it("근접오타가 속도보다 우선한다 (정답이어도 철자가 불완전하면 무조건 hard)", () => {
    expect(
      deriveRating({ isCorrect: true, responseMs: 1, nearMiss: true })
    ).toBe("hard");
  });

  it("threshold를 다르게 주면 그 기준을 따른다 (개인화 대비)", () => {
    expect(deriveRating({ isCorrect: true, responseMs: 5000, fastThresholdMs: 6000 })).toBe(
      "easy"
    );
    expect(deriveRating({ isCorrect: true, responseMs: 5000, fastThresholdMs: 4000 })).toBe(
      "good"
    );
  });
});

describe("gradeTyped — 주관식(뜻→영어 타이핑, 빈칸채우기) 공통 채점", () => {
  it("정확히 일치하면 정답", () => {
    const r = gradeTyped("effect", "effect", 1000);
    expect(r.isCorrect).toBe(true);
    expect(r.rating).toBe("easy");
  });

  it("대소문자·앞뒤 공백은 무시한다", () => {
    const r = gradeTyped("effect", "  Effect  ", 1000);
    expect(r.isCorrect).toBe(true);
  });

  it("한 글자 오타(편집거리 1)는 정답 처리하되 hard로 채점한다", () => {
    const r = gradeTyped("effect", "efect", 1000);
    expect(r.isCorrect).toBe(true);
    expect(r.rating).toBe("hard");
  });

  it("편집거리 2 이상은 오답", () => {
    const r = gradeTyped("effect", "afect", 1000);
    expect(r.isCorrect).toBe(false);
    expect(r.rating).toBe("again");
  });

  it("무응답(빈 문자열)은 오답", () => {
    const r = gradeTyped("effect", "", 1000);
    expect(r.isCorrect).toBe(false);
  });

  it("정답에 detail로 채점 근거를 남긴다", () => {
    const r = gradeTyped("effect", "efect", 1000);
    expect(r.detail).toMatchObject({ editDistance: 1 });
  });
});
