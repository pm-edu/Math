// FigureSpec → SVG 결정론적 렌더러. 순수 함수(같은 스펙 → 같은 SVG) — 지시서 SAT P1 §2.
// 색은 CSS 변수만 쓴다(hex 금지). 모든 도형에 alt 텍스트를 스펙에서 자동 생성한다.

import { compileExpr } from "./expr";
import type { BarChartSpec, CircleSpec, CoordinatePlaneSpec, FigureSpec, ScatterSpec, TableSpec, TriangleSpec } from "./types";

const WIDTH = 480;
const HEIGHT = 360;
const PAD = 36;

const COLOR = {
  ink: "var(--en-ink)",
  inkSoft: "var(--en-ink-soft)",
  line: "var(--en-line)",
  gold: "var(--en-gold)",
};

export interface RenderedFigure {
  svg: string;
  alt: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function svgRoot(body: string): string {
  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif">${body}</svg>`;
}

// ───────── coordinate_plane ─────────

function renderCoordinatePlane(spec: CoordinatePlaneSpec): RenderedFigure {
  const [xMin, xMax] = spec.xRange;
  const [yMin, yMax] = spec.yRange;
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const toPx = (x: number) => PAD + ((x - xMin) / (xMax - xMin)) * innerW;
  const toPy = (y: number) => PAD + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

  const parts: string[] = [];

  // 축
  if (yMin <= 0 && yMax >= 0) {
    parts.push(`<line x1="${PAD}" y1="${toPy(0)}" x2="${WIDTH - PAD}" y2="${toPy(0)}" stroke="${COLOR.line}" stroke-width="1.5"/>`);
  }
  if (xMin <= 0 && xMax >= 0) {
    parts.push(`<line x1="${toPx(0)}" y1="${PAD}" x2="${toPx(0)}" y2="${HEIGHT - PAD}" stroke="${COLOR.line}" stroke-width="1.5"/>`);
  }
  parts.push(
    `<rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="none" stroke="${COLOR.line}" stroke-width="1"/>`,
  );

  for (const line of spec.lines ?? []) {
    const { a, b, c } = line;
    const pts: { x: number; y: number }[] = [];
    if (b !== 0) {
      pts.push({ x: xMin, y: (c - a * xMin) / b }, { x: xMax, y: (c - a * xMax) / b });
    } else if (a !== 0) {
      pts.push({ x: c / a, y: yMin }, { x: c / a, y: yMax });
    }
    if (pts.length === 2) {
      parts.push(
        `<line x1="${fmt(toPx(pts[0].x))}" y1="${fmt(toPy(pts[0].y))}" x2="${fmt(toPx(pts[1].x))}" y2="${fmt(toPy(pts[1].y))}" stroke="${COLOR.ink}" stroke-width="2"/>`,
      );
    }
  }

  for (const curve of spec.curves ?? []) {
    const f = compileExpr(curve.expr);
    const STEPS = 200;
    let segment: string[] = [];
    const segments: string[][] = [];
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + ((xMax - xMin) * i) / STEPS;
      const y = f(x);
      if (!Number.isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
        if (segment.length) segments.push(segment);
        segment = [];
        continue;
      }
      segment.push(`${fmt(toPx(x))},${fmt(toPy(y))}`);
    }
    if (segment.length) segments.push(segment);
    for (const seg of segments) {
      if (seg.length < 2) continue;
      parts.push(`<polyline points="${seg.join(" ")}" fill="none" stroke="${COLOR.gold}" stroke-width="2"/>`);
    }
  }

  for (const p of spec.points ?? []) {
    parts.push(`<circle cx="${fmt(toPx(p.x))}" cy="${fmt(toPy(p.y))}" r="4" fill="${COLOR.ink}"/>`);
    if (p.label) {
      parts.push(
        `<text x="${fmt(toPx(p.x) + 6)}" y="${fmt(toPy(p.y) - 6)}" fill="${COLOR.ink}" font-size="13">${escapeXml(p.label)}</text>`,
      );
    }
  }

  const pointDesc = (spec.points ?? []).map((p) => `${p.label ? p.label + "(" : "("}${fmt(p.x)}, ${fmt(p.y)})`).join(", ");
  const alt =
    `좌표평면. x축 ${fmt(xMin)}부터 ${fmt(xMax)}까지, y축 ${fmt(yMin)}부터 ${fmt(yMax)}까지.` +
    (spec.lines?.length ? ` 직선 ${spec.lines.length}개.` : "") +
    (spec.curves?.length ? ` 곡선 ${spec.curves.length}개.` : "") +
    (pointDesc ? ` 표시된 점: ${pointDesc}.` : "");

  return { svg: svgRoot(parts.join("")), alt };
}

// ───────── triangle ─────────

function renderTriangle(spec: TriangleSpec): RenderedFigure {
  const xs = spec.vertices.map((v) => v.x);
  const ys = spec.vertices.map((v) => v.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 1;
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const scale = Math.min(innerW / spanX, innerH / spanY);
  const offsetX = PAD + (innerW - spanX * scale) / 2;
  const offsetY = PAD + (innerH - spanY * scale) / 2;
  const toPx = (x: number) => offsetX + (x - xMin) * scale;
  const py = (y: number) => offsetY + (spanY * scale - (y - yMin) * scale); // y축 뒤집기(SVG는 아래로 증가)

  const [v0, v1, v2] = spec.vertices;
  const pts = `${fmt(toPx(v0.x))},${fmt(py(v0.y))} ${fmt(toPx(v1.x))},${fmt(py(v1.y))} ${fmt(toPx(v2.x))},${fmt(py(v2.y))}`;
  const parts: string[] = [`<polygon points="${pts}" fill="none" stroke="${COLOR.ink}" stroke-width="2"/>`];

  const labels = spec.labels ?? ["A", "B", "C"];
  spec.vertices.forEach((v, i) => {
    const lx = toPx(v.x);
    const ly = py(v.y);
    parts.push(`<circle cx="${fmt(lx)}" cy="${fmt(ly)}" r="3" fill="${COLOR.ink}"/>`);
    parts.push(`<text x="${fmt(lx + 8)}" y="${fmt(ly - 4)}" fill="${COLOR.ink}" font-size="14" font-weight="bold">${escapeXml(labels[i])}</text>`);
  });

  if (spec.sideLabels) {
    const mid = (a: typeof v0, b: typeof v0) => ({ x: toPx((a.x + b.x) / 2), y: py((a.y + b.y) / 2) });
    const { ab, bc, ca } = spec.sideLabels;
    if (ab) {
      const m = mid(v0, v1);
      parts.push(`<text x="${fmt(m.x)}" y="${fmt(m.y)}" fill="${COLOR.inkSoft}" font-size="12" text-anchor="middle">${escapeXml(ab)}</text>`);
    }
    if (bc) {
      const m = mid(v1, v2);
      parts.push(`<text x="${fmt(m.x)}" y="${fmt(m.y)}" fill="${COLOR.inkSoft}" font-size="12" text-anchor="middle">${escapeXml(bc)}</text>`);
    }
    if (ca) {
      const m = mid(v2, v0);
      parts.push(`<text x="${fmt(m.x)}" y="${fmt(m.y)}" fill="${COLOR.inkSoft}" font-size="12" text-anchor="middle">${escapeXml(ca)}</text>`);
    }
  }

  if (spec.rightAngleAt !== undefined) {
    const v = spec.vertices[spec.rightAngleAt];
    parts.push(`<rect x="${fmt(toPx(v.x) - 8)}" y="${fmt(py(v.y) - 8)}" width="8" height="8" fill="none" stroke="${COLOR.gold}" stroke-width="1.5"/>`);
  }

  const alt =
    `삼각형 ${labels.join("")}` +
    (spec.rightAngleAt !== undefined ? `, 직각은 ${labels[spec.rightAngleAt]}에 있음` : "") +
    (spec.sideLabels ? `, 변 길이: ${Object.values(spec.sideLabels).filter(Boolean).join(", ")}` : "") +
    ".";

  return { svg: svgRoot(parts.join("")), alt };
}

// ───────── circle ─────────

function renderCircle(spec: CircleSpec): RenderedFigure {
  const span = spec.radius * 2.4;
  const scale = Math.min((WIDTH - PAD * 2) / span, (HEIGHT - PAD * 2) / span);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const toPx = (x: number) => cx + (x - spec.center.x) * scale;
  const toPy = (y: number) => cy - (y - spec.center.y) * scale;
  const r = spec.radius * scale;

  const parts: string[] = [
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="none" stroke="${COLOR.ink}" stroke-width="2"/>`,
    `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="2.5" fill="${COLOR.ink}"/>`,
  ];

  if (spec.radiusLabel) {
    parts.push(
      `<line x1="${fmt(cx)}" y1="${fmt(cy)}" x2="${fmt(cx + r)}" y2="${fmt(cy)}" stroke="${COLOR.gold}" stroke-width="1.5"/>`,
      `<text x="${fmt(cx + r / 2)}" y="${fmt(cy - 6)}" fill="${COLOR.inkSoft}" font-size="12" text-anchor="middle">${escapeXml(spec.radiusLabel)}</text>`,
    );
  }

  for (const p of spec.points ?? []) {
    parts.push(`<circle cx="${fmt(toPx(p.x))}" cy="${fmt(toPy(p.y))}" r="3" fill="${COLOR.ink}"/>`);
    if (p.label) {
      parts.push(`<text x="${fmt(toPx(p.x) + 6)}" y="${fmt(toPy(p.y) - 6)}" fill="${COLOR.ink}" font-size="13">${escapeXml(p.label)}</text>`);
    }
  }

  for (const chord of spec.chords ?? []) {
    const a = spec.points?.[chord.from];
    const b = spec.points?.[chord.to];
    if (!a || !b) continue;
    parts.push(
      `<line x1="${fmt(toPx(a.x))}" y1="${fmt(toPy(a.y))}" x2="${fmt(toPx(b.x))}" y2="${fmt(toPy(b.y))}" stroke="${COLOR.ink}" stroke-width="1.5"/>`,
    );
  }

  const alt = `원. 반지름 ${spec.radiusLabel ?? fmt(spec.radius)}` + (spec.points?.length ? `, 원 위의 점 ${spec.points.length}개` : "") + ".";
  return { svg: svgRoot(parts.join("")), alt };
}

// ───────── bar_chart ─────────

function renderBarChart(spec: BarChartSpec): RenderedFigure {
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const maxV = Math.max(...spec.values, 0);
  const n = spec.categories.length;
  const barW = innerW / n / 1.6;
  const gap = innerW / n;

  const parts: string[] = [
    `<line x1="${PAD}" y1="${HEIGHT - PAD}" x2="${WIDTH - PAD}" y2="${HEIGHT - PAD}" stroke="${COLOR.line}" stroke-width="1.5"/>`,
    `<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${HEIGHT - PAD}" stroke="${COLOR.line}" stroke-width="1.5"/>`,
  ];

  spec.values.forEach((v, i) => {
    const h = maxV > 0 ? (v / maxV) * innerH : 0;
    const x = PAD + gap * i + (gap - barW) / 2;
    const y = HEIGHT - PAD - h;
    parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(barW)}" height="${fmt(h)}" fill="${COLOR.gold}"/>`);
    parts.push(
      `<text x="${fmt(x + barW / 2)}" y="${HEIGHT - PAD + 16}" fill="${COLOR.ink}" font-size="12" text-anchor="middle">${escapeXml(spec.categories[i])}</text>`,
    );
    parts.push(`<text x="${fmt(x + barW / 2)}" y="${fmt(y - 6)}" fill="${COLOR.inkSoft}" font-size="11" text-anchor="middle">${fmt(v)}</text>`);
  });

  const alt = `막대그래프. ${spec.xLabel ?? "항목"}별 ${spec.yLabel ?? "값"}: ${spec.categories.map((c, i) => `${c}=${fmt(spec.values[i])}`).join(", ")}.`;
  return { svg: svgRoot(parts.join("")), alt };
}

// ───────── scatter ─────────

function renderScatter(spec: ScatterSpec): RenderedFigure {
  const xs = spec.points.map((p) => p.x);
  const ys = spec.points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 1;
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const toPx = (x: number) => PAD + ((x - xMin) / spanX) * innerW;
  const toPy = (y: number) => PAD + innerH - ((y - yMin) / spanY) * innerH;

  const parts: string[] = [
    `<rect x="${PAD}" y="${PAD}" width="${innerW}" height="${innerH}" fill="none" stroke="${COLOR.line}" stroke-width="1"/>`,
  ];

  for (const p of spec.points) {
    parts.push(`<circle cx="${fmt(toPx(p.x))}" cy="${fmt(toPy(p.y))}" r="3.5" fill="${COLOR.ink}"/>`);
  }

  if (spec.trendLine) {
    const { slope, intercept } = spec.trendLine;
    const y1 = slope * xMin + intercept;
    const y2 = slope * xMax + intercept;
    parts.push(
      `<line x1="${fmt(toPx(xMin))}" y1="${fmt(toPy(y1))}" x2="${fmt(toPx(xMax))}" y2="${fmt(toPy(y2))}" stroke="${COLOR.gold}" stroke-width="2"/>`,
    );
  }

  const alt = `산점도. 점 ${spec.points.length}개` + (spec.trendLine ? `, 추세선 y = ${fmt(spec.trendLine.slope)}x + ${fmt(spec.trendLine.intercept)}` : "") + ".";
  return { svg: svgRoot(parts.join("")), alt };
}

// ───────── table ─────────

function renderTable(spec: TableSpec): RenderedFigure {
  const cols = spec.headers.length;
  const rows = spec.rows.length + 1;
  const cellW = (WIDTH - PAD * 2) / cols;
  const cellH = Math.min(32, (HEIGHT - PAD * 2) / rows);

  const parts: string[] = [];
  const allRows = [spec.headers, ...spec.rows.map((r) => r.map((c) => String(c)))];
  allRows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const x = PAD + c * cellW;
      const y = PAD + r * cellH;
      parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(cellW)}" height="${fmt(cellH)}" fill="none" stroke="${COLOR.line}" stroke-width="1"/>`);
      parts.push(
        `<text x="${fmt(x + cellW / 2)}" y="${fmt(y + cellH / 2 + 4)}" fill="${COLOR.ink}" font-size="12" font-weight="${r === 0 ? "bold" : "normal"}" text-anchor="middle">${escapeXml(cell)}</text>`,
      );
    });
  });

  const alt =
    `표${spec.caption ? " — " + spec.caption : ""}. 열: ${spec.headers.join(", ")}. ` +
    `${spec.rows.length}행: ` +
    spec.rows.map((r) => r.join("/")).join("; ") +
    ".";

  return { svg: svgRoot(parts.join("")), alt };
}

export function renderFigureToSvg(spec: FigureSpec): RenderedFigure {
  switch (spec.kind) {
    case "coordinate_plane":
      return renderCoordinatePlane(spec);
    case "triangle":
      return renderTriangle(spec);
    case "circle":
      return renderCircle(spec);
    case "bar_chart":
      return renderBarChart(spec);
    case "scatter":
      return renderScatter(spec);
    case "table":
      return renderTable(spec);
  }
}
