// 함수 그래프를 서버에서 결정적으로 SVG로 그린다. AI는 식(expr)과 x범위만 주고,
// 실제 좌표 계산·그리기는 전부 여기서 한다 — "그림이 이상하게 나올" 위험을
// "AI가 식을 정확히 썼는가"로만 좁히기 위함(도형과 달리 좌표 산출이 단순해 검증하기 쉬움).

import { compile } from "mathjs";

export type FunctionGraphSpec = {
  expr: string; // 예: "x^2 - 4", "sin(x)"
  xMin: number;
  xMax: number;
};

type Result = { ok: true; svg: string } | { ok: false; message: string };

const WIDTH = 420;
const HEIGHT = 320;
const PAD = 36; // 축 눈금 라벨을 위한 여백
const SAMPLES = 240;

// 사이트 팔레트(src/app/globals.css)와 맞춘 고정 색상 — SVG는 이미지로 업로드되어
// 페이지의 CSS 변수를 못 쓰므로 값을 그대로 박아둔다.
const COLOR_FG = "#2C2C2A";
const COLOR_AXIS = "#5C5A52";
const COLOR_GRID = "#E8E0CC";
const COLOR_CURVE = "#4B1528";
const COLOR_BG = "#FFFFFF";

function niceStep(range: number): number {
  const rough = range / 6;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

function fmt(n: number): string {
  if (Math.abs(n) < 1e-9) return "0";
  return Number(n.toFixed(2)).toString();
}

export function renderFunctionGraphSvg(spec: FunctionGraphSpec): Result {
  const xMin = Math.min(spec.xMin, spec.xMax);
  const xMax = Math.max(spec.xMin, spec.xMax);
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax - xMin < 1e-6) {
    return { ok: false, message: "x 범위가 올바르지 않습니다." };
  }
  // 너무 넓은 범위는 그래프가 무의미해지므로 제한한다.
  const clampedXMax = Math.min(xMax, xMin + 200);

  let node;
  try {
    node = compile(spec.expr);
  } catch {
    return { ok: false, message: "함수식을 해석하지 못했습니다." };
  }

  const points: { x: number; y: number }[] = [];
  const step = (clampedXMax - xMin) / SAMPLES;
  for (let i = 0; i <= SAMPLES; i++) {
    const x = xMin + step * i;
    let y: number;
    try {
      const evaluated = node.evaluate({ x });
      y = typeof evaluated === "number" ? evaluated : Number(evaluated);
    } catch {
      continue;
    }
    if (Number.isFinite(y)) points.push({ x, y });
  }
  if (points.length < 2) return { ok: false, message: "이 구간에서 계산 가능한 값이 없습니다." };

  let yMin = Math.min(...points.map((p) => p.y));
  let yMax = Math.max(...points.map((p) => p.y));
  if (yMax - yMin < 1e-6) {
    yMin -= 1;
    yMax += 1;
  }
  // 위아래 여유를 조금 둔다.
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad;
  yMax += yPad;

  const plotW = WIDTH - PAD * 2;
  const plotH = HEIGHT - PAD * 2;
  const toPx = (x: number) => PAD + ((x - xMin) / (clampedXMax - xMin)) * plotW;
  const toPy = (y: number) => PAD + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

  // 곡선 경로 — 값이 이어지지 않는 구간(정의역 밖)은 새 서브패스로 끊는다.
  let path = "";
  let pen = false;
  for (const p of points) {
    const px = toPx(p.x);
    const py = toPy(p.y);
    if (py < -1000 || py > HEIGHT + 1000) { pen = false; continue; } // 극단값은 화면 밖이므로 끊음
    path += (pen ? " L " : " M ") + px.toFixed(1) + " " + py.toFixed(1);
    pen = true;
  }

  // 격자·눈금
  const xStep = niceStep(clampedXMax - xMin);
  const yStep = niceStep(yMax - yMin);
  let grid = "";
  let labels = "";
  for (let gx = Math.ceil(xMin / xStep) * xStep; gx <= clampedXMax; gx += xStep) {
    const px = toPx(gx);
    grid += `<line x1="${px.toFixed(1)}" y1="${PAD}" x2="${px.toFixed(1)}" y2="${HEIGHT - PAD}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
    labels += `<text x="${px.toFixed(1)}" y="${HEIGHT - PAD + 16}" font-size="11" fill="${COLOR_AXIS}" text-anchor="middle">${fmt(gx)}</text>`;
  }
  for (let gy = Math.ceil(yMin / yStep) * yStep; gy <= yMax; gy += yStep) {
    const py = toPy(gy);
    grid += `<line x1="${PAD}" y1="${py.toFixed(1)}" x2="${WIDTH - PAD}" y2="${py.toFixed(1)}" stroke="${COLOR_GRID}" stroke-width="1"/>`;
    labels += `<text x="${PAD - 6}" y="${(py + 3.5).toFixed(1)}" font-size="11" fill="${COLOR_AXIS}" text-anchor="end">${fmt(gy)}</text>`;
  }

  // x=0, y=0 축(범위 안에 있을 때만)
  let axes = "";
  if (xMin <= 0 && 0 <= clampedXMax) {
    const px = toPx(0);
    axes += `<line x1="${px.toFixed(1)}" y1="${PAD}" x2="${px.toFixed(1)}" y2="${HEIGHT - PAD}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`;
  }
  if (yMin <= 0 && 0 <= yMax) {
    const py = toPy(0);
    axes += `<line x1="${PAD}" y1="${py.toFixed(1)}" x2="${WIDTH - PAD}" y2="${py.toFixed(1)}" stroke="${COLOR_AXIS}" stroke-width="1.5"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${COLOR_BG}"/>
  <rect x="${PAD}" y="${PAD}" width="${plotW}" height="${plotH}" fill="none" stroke="${COLOR_GRID}" stroke-width="1"/>
  ${grid}
  ${axes}
  <path d="${path}" fill="none" stroke="${COLOR_CURVE}" stroke-width="2.2" stroke-linejoin="round"/>
  ${labels}
  <text x="${WIDTH - 8}" y="${PAD - 10}" font-size="12" fill="${COLOR_FG}" text-anchor="end" font-style="italic">y</text>
  <text x="${WIDTH - PAD + 8}" y="${HEIGHT - PAD + 4}" font-size="12" fill="${COLOR_FG}" font-style="italic">x</text>
</svg>`;

  return { ok: true, svg };
}
