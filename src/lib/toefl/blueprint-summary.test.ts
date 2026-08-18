import { describe, expect, it } from "vitest";
import { formatDuration, summarizeBySection, totalSummary } from "./blueprint-summary";

const DEMO_ROWS = [
  { section: "reading" as const, stage: "stage1" as const, time_limit_sec: 1080, item_count: 9 },
  { section: "reading" as const, stage: "stage2" as const, time_limit_sec: 900, item_count: 8 },
  { section: "reading" as const, stage: "stage2" as const, time_limit_sec: 900, item_count: 8 },
  { section: "listening" as const, stage: "stage1" as const, time_limit_sec: 1200, item_count: 10 },
  { section: "listening" as const, stage: "stage2" as const, time_limit_sec: 900, item_count: 8 },
  { section: "listening" as const, stage: "stage2" as const, time_limit_sec: 900, item_count: 8 },
  { section: "speaking" as const, stage: "stage1" as const, time_limit_sec: 600, item_count: 4 },
  { section: "writing" as const, stage: "stage1" as const, time_limit_sec: 1500, item_count: 3 },
];

describe("summarizeBySection", () => {
  it("stage1 + stage2(하나만) 합산 — 같은 섹션에 stage2 행이 여러 route로 중복돼도 한 번만 더한다", () => {
    const summary = summarizeBySection(DEMO_ROWS);
    expect(summary.find((s) => s.section === "reading")).toEqual({ section: "reading", timeSec: 1980, itemCount: 17 });
    expect(summary.find((s) => s.section === "listening")).toEqual({ section: "listening", timeSec: 2100, itemCount: 18 });
  });

  it("stage2가 없는 섹션(speaking/writing)은 stage1만", () => {
    const summary = summarizeBySection(DEMO_ROWS);
    expect(summary.find((s) => s.section === "speaking")).toEqual({ section: "speaking", timeSec: 600, itemCount: 4 });
    expect(summary.find((s) => s.section === "writing")).toEqual({ section: "writing", timeSec: 1500, itemCount: 3 });
  });

  it("행이 없는 섹션은 결과에 없다", () => {
    expect(summarizeBySection([])).toEqual([]);
  });
});

describe("totalSummary", () => {
  it("4개 섹션 전체를 합산한다", () => {
    expect(totalSummary(DEMO_ROWS)).toEqual({ timeSec: 1980 + 2100 + 600 + 1500, itemCount: 17 + 18 + 4 + 3 });
  });

  it("빈 배열은 0", () => {
    expect(totalSummary([])).toEqual({ timeSec: 0, itemCount: 0 });
  });
});

describe("formatDuration", () => {
  it("1시간 미만은 분만 표시", () => {
    expect(formatDuration(33 * 60)).toBe("33 min");
  });

  it("1시간 이상은 시+분 표시", () => {
    expect(formatDuration(103 * 60)).toBe("1 hr 43 min");
  });

  it("정확히 1시간이면 분 생략", () => {
    expect(formatDuration(60 * 60)).toBe("1 hr");
  });

  it("초 단위는 반올림해 분으로", () => {
    expect(formatDuration(90)).toBe("2 min"); // 1.5분 -> 반올림
  });
});
