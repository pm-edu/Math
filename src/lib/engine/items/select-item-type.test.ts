import { describe, expect, it } from "vitest";
import { pickItemTypeForLevel } from "./select-item-type";

describe("pickItemTypeForLevel — 사다리 레벨에 맞는 문항 유형을 고른다", () => {
  it("레벨 0·1(미학습/인지)은 EN_KO_MC", () => {
    expect(pickItemTypeForLevel(0)).toBe("EN_KO_MC");
    expect(pickItemTypeForLevel(1)).toBe("EN_KO_MC");
  });

  it("레벨 2(회상)는 KO_EN_TYPE", () => {
    expect(pickItemTypeForLevel(2)).toBe("KO_EN_TYPE");
  });

  it("레벨 3 이상(생산)은 CLOZE", () => {
    expect(pickItemTypeForLevel(3)).toBe("CLOZE");
    expect(pickItemTypeForLevel(4)).toBe("CLOZE");
    expect(pickItemTypeForLevel(5)).toBe("CLOZE");
  });

  it("혼동쌍 상대가 있으면(hasConfusionPartner) CONTRAST를 섞어 낼 수 있다", () => {
    // rng를 0으로 고정하면 항상 대조 문항을 낸다(결정적 테스트)
    expect(pickItemTypeForLevel(2, { hasConfusionPartner: true, rng: () => 0 })).toBe("CONTRAST");
  });

  it("혼동쌍 상대가 있어도 rng가 확률을 넘기면 원래 레벨의 유형을 낸다", () => {
    expect(pickItemTypeForLevel(2, { hasConfusionPartner: true, rng: () => 0.99 })).toBe("KO_EN_TYPE");
  });
});
