import { describe, expect, it } from "vitest";
import { buildSlotStatus, isFormComplete, totalShortage, type BlueprintRow, type ModuleRow } from "./admin-slots";

const blueprint: BlueprintRow[] = [
  { section: "reading", stage: "stage1", route: "core", item_count: 10, task_mix: { complete_the_words: 6, daily_life: 4 } },
  { section: "listening", stage: "stage2", route: "hard", item_count: 9, task_mix: { announcement: 4, academic_talk: 5 } },
];

const modules: ModuleRow[] = [
  { id: "m-read", section: "reading", stage: "stage1", route: "core" },
  { id: "m-listen", section: "listening", stage: "stage2", route: "hard" },
];

describe("buildSlotStatus", () => {
  it("채워진 슬롯은 부족분이 없다", () => {
    const slots = buildSlotStatus(blueprint, modules, {
      "m-read": { complete_the_words: 6, daily_life: 4 },
      "m-listen": { announcement: 4, academic_talk: 5 },
    });
    expect(slots.map((s) => s.actual)).toEqual([10, 9]);
    expect(slots.every((s) => s.shortages.length === 0)).toBe(true);
    expect(isFormComplete(slots)).toBe(true);
    expect(totalShortage(slots)).toBe(0);
  });

  it("유형별로 부족한 만큼만 shortages에 담는다", () => {
    const slots = buildSlotStatus(blueprint, modules, {
      "m-read": { complete_the_words: 6, daily_life: 4 },
      "m-listen": { announcement: 4, academic_talk: 3 },
    });
    expect(slots[1].actual).toBe(7);
    expect(slots[1].shortages).toEqual([{ taskType: "academic_talk", required: 5, actual: 3 }]);
    expect(isFormComplete(slots)).toBe(false);
    expect(totalShortage(slots)).toBe(2);
  });

  it("모듈이 아직 없는 슬롯은 0문항으로 본다", () => {
    const slots = buildSlotStatus(blueprint, [modules[0]], { "m-read": { complete_the_words: 6, daily_life: 4 } });
    expect(slots[1].moduleId).toBeNull();
    expect(slots[1].actual).toBe(0);
    expect(totalShortage(slots)).toBe(9);
  });

  // 유형 합계가 블루프린트 총량과 맞아도, 특정 유형이 남고 다른 유형이 모자라면 미충족이다.
  it("총량이 맞아도 유형 구성이 틀리면 미충족", () => {
    const slots = buildSlotStatus([blueprint[0]], [modules[0]], {
      "m-read": { complete_the_words: 10, daily_life: 0 },
    });
    expect(slots[0].actual).toBe(10);
    expect(slots[0].shortages).toEqual([{ taskType: "daily_life", required: 4, actual: 0 }]);
    expect(isFormComplete(slots)).toBe(false);
  });

  it("빈 블루프린트는 완성으로 보지 않는다", () => {
    expect(isFormComplete([])).toBe(false);
  });
});
