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
  angleLabels?: { at: 0 | 1 | 2; text: string }[]; // 각 크기 표시(예: "50°") — 꼭짓점 안쪽에 텍스트로
  extraPoints?: Point[]; // 보조점(각의 이등분선이 만나는 점, 변의 연장선 위의 점 등)
  extraSegments?: { from: Point; to: Point; dashed?: boolean }[]; // 보조선(이등분선, 연장선 등)
};

export type QuadrilateralSpec = {
  kind: "quadrilateral";
  vertices: [Point, Point, Point, Point]; // 순서대로 이어짐(A→B→C→D→A)
  labels?: [string, string, string, string];
  sideLabels?: { ab?: string; bc?: string; cd?: string; da?: string };
  rightAngleAt?: 0 | 1 | 2 | 3;
  angleLabels?: { at: 0 | 1 | 2 | 3; text: string }[];
  extraPoints?: Point[]; // 보조점(대각선 교점 등)
  extraSegments?: { from: Point; to: Point; dashed?: boolean }[]; // 대각선 등
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

export type FigureSpec =
  | CoordinatePlaneSpec
  | TriangleSpec
  | QuadrilateralSpec
  | CircleSpec
  | BarChartSpec
  | ScatterSpec
  | TableSpec;
