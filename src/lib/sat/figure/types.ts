// SAT 문항 도형 스펙. LLM은 이 스펙(JSON)만 만들고, SVG는 render.ts가 결정론적으로 그린다
// (LLM이 SVG를 직접 쓰면 좌표·라벨 오류가 잦다 — 지시서 SAT P1 §2).

export interface Point {
  x: number;
  y: number;
  label?: string;
}

export type CoordinatePlaneSpec = {
  kind: "coordinate_plane";
  xRange: [number, number];
  yRange: [number, number];
  points?: Point[];
  lines?: { a: number; b: number; c: number }[]; // ax + by = c
  curves?: { expr: string; label?: string }[]; // x에 대한 식, 예: "x^2 - 3*x + 2"
};

export type TriangleSpec = {
  kind: "triangle";
  vertices: [Point, Point, Point];
  labels?: [string, string, string]; // 꼭짓점 이름, 예: ["A", "B", "C"]
  sideLabels?: { ab?: string; bc?: string; ca?: string }; // 변 위에 표시할 텍스트(길이 등)
  rightAngleAt?: 0 | 1 | 2; // 직각 표시할 꼭짓점 인덱스
};

export type CircleSpec = {
  kind: "circle";
  center: Point;
  radius: number;
  radiusLabel?: string;
  points?: Point[]; // 원 위의 점(호·현 표시용)
  chords?: { from: number; to: number; label?: string }[]; // points 배열의 인덱스 쌍
};

export type BarChartSpec = {
  kind: "bar_chart";
  categories: string[];
  values: number[];
  xLabel?: string;
  yLabel?: string;
};

export type ScatterSpec = {
  kind: "scatter";
  points: Point[];
  xLabel?: string;
  yLabel?: string;
  trendLine?: { slope: number; intercept: number }; // y = slope*x + intercept
};

export type TableSpec = {
  kind: "table";
  headers: string[];
  rows: (string | number)[][];
  caption?: string;
};

export type FigureSpec = CoordinatePlaneSpec | TriangleSpec | CircleSpec | BarChartSpec | ScatterSpec | TableSpec;
