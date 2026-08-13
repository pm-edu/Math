import { describe, expect, it } from "vitest";
import { selectDistractors, type DistractorCandidate } from "./distractors";

type W = { id: string; label: string };

function candidate(id: string, key: string, isConfusion = false): DistractorCandidate<W> {
  return { item: { id, label: key }, key, isConfusion };
}

describe("selectDistractors — 무작위가 아니라 우선순위대로 뽑는다", () => {
  it("혼동쌍 후보를 최우선으로 뽑는다", () => {
    const pool = [
      candidate("a", "받아들이다"),
      candidate("b", "제외하고", true), // 실제 혼동 이력 있음
      candidate("c", "고용하다"),
      candidate("d", "판단하다"),
    ];
    const picked = selectDistractors("영향을 미치다", pool, 1);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe("b");
  });

  it("철자 유사(편집거리 가까움)를 그다음 우선순위로 뽑는다", () => {
    const pool = [
      candidate("close1", "effect"), // target "affect"와 편집거리 1
      candidate("far1", "banana"),
      candidate("far2", "spectator"),
    ];
    const picked = selectDistractors("affect", pool, 1);
    expect(picked[0].id).toBe("close1");
  });

  it("타깃과 같은 키(정답과 동일한 값)는 후보에서 제외한다", () => {
    const pool = [candidate("same", "정답뜻"), candidate("other", "다른뜻")];
    const picked = selectDistractors("정답뜻", pool, 2);
    expect(picked.map((p) => p.id)).not.toContain("same");
  });

  it("선택지끼리 중복되는 키는 넣지 않는다", () => {
    const pool = [
      candidate("a", "같은뜻"),
      candidate("b", "같은뜻"), // 다른 단어지만 뜻 텍스트가 같음
      candidate("c", "다른뜻"),
    ];
    const picked = selectDistractors("타깃", pool, 2);
    const keys = new Set(pool.filter((c) => picked.some((p) => p.id === c.item.id)).map((c) => c.key));
    expect(keys.size).toBe(picked.length);
  });

  it("요청한 개수만큼 뽑되, 후보가 모자라면 있는 만큼만 뽑는다", () => {
    const pool = [candidate("a", "하나")];
    expect(selectDistractors("타깃", pool, 3)).toHaveLength(1);
  });

  it("우선순위 상위가 부족하면 하위 순위(무작위 나머지)로 채운다", () => {
    const pool = [
      candidate("confusion1", "혼동단어", true),
      candidate("rand1", "완전무관1"),
      candidate("rand2", "완전무관2"),
    ];
    const picked = selectDistractors("타깃", pool, 3, { rng: () => 0 });
    expect(picked).toHaveLength(3);
    expect(picked.map((p) => p.id)).toContain("confusion1");
  });

  it("rng를 고정하면 무작위 채우기 결과가 결정적이다(재현 가능)", () => {
    const pool = [
      candidate("r1", "1무관"),
      candidate("r2", "2무관"),
      candidate("r3", "3무관"),
      candidate("r4", "4무관"),
    ];
    const a = selectDistractors("타깃", pool, 2, { rng: () => 0.1 });
    const b = selectDistractors("타깃", pool, 2, { rng: () => 0.1 });
    expect(a).toEqual(b);
  });
});
