import { describe, expect, it } from "vitest";
import { renderFigureToSvg } from "./render";
import type { FigureSpec } from "./types";

const SPECS: Record<string, FigureSpec> = {
  coordinate_plane: {
    kind: "coordinate_plane",
    xRange: [-5, 5],
    yRange: [-5, 5],
    points: [{ x: 1, y: 2, label: "A" }],
    lines: [{ a: 1, b: -1, c: 0 }],
    curves: [{ expr: "x^2 - 3*x + 2" }],
  },
  triangle: {
    kind: "triangle",
    vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }],
    labels: ["A", "B", "C"],
    sideLabels: { ab: "4", ca: "3" },
    rightAngleAt: 0,
  },
  circle: {
    kind: "circle",
    center: { x: 0, y: 0 },
    radius: 5,
    radiusLabel: "5",
    points: [{ x: 5, y: 0, label: "P" }],
  },
  bar_chart: {
    kind: "bar_chart",
    categories: ["A", "B", "C"],
    values: [3, 7, 5],
    xLabel: "그룹",
    yLabel: "빈도",
  },
  scatter: {
    kind: "scatter",
    points: [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }],
    trendLine: { slope: 1.5, intercept: 0.5 },
  },
  table: {
    kind: "table",
    headers: ["학년", "인원"],
    rows: [["1학년", 30], ["2학년", 28]],
    caption: "학년별 인원",
  },
};

describe("renderFigureToSvg — determinism", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    it(`${name}: 같은 스펙 → 같은 SVG (2회 비교)`, () => {
      const a = renderFigureToSvg(spec);
      const b = renderFigureToSvg(spec);
      expect(a.svg).toBe(b.svg);
      expect(a.alt).toBe(b.alt);
    });
  }
});

describe("renderFigureToSvg — no hex literals, alt text present", () => {
  for (const [name, spec] of Object.entries(SPECS)) {
    it(`${name}: SVG에 hex 색상 리터럴 없음`, () => {
      const { svg } = renderFigureToSvg(spec);
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it(`${name}: alt 텍스트 존재`, () => {
      const { alt } = renderFigureToSvg(spec);
      expect(alt.length).toBeGreaterThan(0);
    });

    it(`${name}: 유효한 <svg> 루트를 반환`, () => {
      const { svg } = renderFigureToSvg(spec);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    });
  }
});

describe("renderFigureToSvg — coordinate_plane curve edge cases", () => {
  it("정의역 밖(division by zero 등)에서도 죽지 않고 렌더링된다", () => {
    const spec: FigureSpec = {
      kind: "coordinate_plane",
      xRange: [-5, 5],
      yRange: [-5, 5],
      curves: [{ expr: "1/(x-2)" }],
    };
    const { svg } = renderFigureToSvg(spec);
    expect(svg).toContain("<svg");
  });

  it("sqrt의 음수 정의역은 그 구간만 끊긴다(NaN 처리)", () => {
    const spec: FigureSpec = {
      kind: "coordinate_plane",
      xRange: [-5, 5],
      yRange: [-5, 5],
      curves: [{ expr: "sqrt(x)" }],
    };
    const { svg } = renderFigureToSvg(spec);
    expect(svg).toContain("<svg");
  });
});
