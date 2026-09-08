import katex from "katex";
import type { Problem, Worksheet } from "@/lib/problems";

// 화면(MathText, src/components/ProblemBody.tsx)과 똑같은 정규식·옵션으로 LaTeX를
// KaTeX HTML로 바꾼다 — PDF에서 수식이 화면과 다르게 보이는 일이 없도록 로직을 그대로 맞춘다.
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMathHtml(text: string): string {
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) out += esc(text.slice(last, m.index));
    const display = m[1] !== undefined || m[3] !== undefined;
    const latex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    try {
      out += katex.renderToString(latex, { displayMode: display, throwOnError: false });
    } catch {
      out += esc(latex);
    }
    last = MATH_RE.lastIndex;
  }
  if (last < text.length) out += esc(text.slice(last));
  return out;
}

function questionBodyHtml(p: Problem): string {
  if (p.problem_type === "text" && p.content_text) {
    const extraImg = p.image_url ? `<img class="q-img" src="${esc(p.image_url)}" alt="참고 그림" />` : "";
    return `<div class="q-text">${renderMathHtml(p.content_text)}</div>${extraImg}`;
  }
  return `<img class="q-img" src="${esc(p.image_url)}" alt="문제 이미지" />`;
}

function answerBlockHtml(p: Problem): string {
  const choices = (p.choices ?? []).filter((c) => (c ?? "").trim());
  if (choices.length > 0) {
    const items = choices
      .map((c, i) => `<span>${String.fromCharCode(9312 + i)} ${renderMathHtml(c)}</span>`)
      .join("");
    return `<div class="q-choices">${items}</div>`;
  }
  if (p.problem_format === "서술형") {
    return `<div class="q-blank wide"></div><div class="q-blank wide" style="margin-top:14px;"></div>`;
  }
  return `<div class="q-blank"></div>`;
}

const FORMAT_LABEL: Record<string, string> = {
  객관식: "객관식",
  단답형: "단답형",
  서술형: "서술형",
};

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #1F2A44; font-size: 12px; }
  .page { padding: 6mm 4mm; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #182A4E; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-weight: 800; color: #182A4E; font-size: 15px; }
  .brand b { color: #D98C0F; }
  .meta { text-align: right; font-size: 10px; color: #7C88A6; line-height: 1.5; }
  .title { font-size: 18px; font-weight: 700; color: #182A4E; margin: 0 0 4px; }
  .sub { font-size: 11px; color: #7C88A6; margin: 0 0 20px; }
  .foot-brand { text-align: center; font-size: 9px; color: #A6B0C8; margin-top: 24px; }
`;

const QUESTIONS_CSS = `
  .q { margin-bottom: 20px; break-inside: avoid; }
  .q-head { display: flex; gap: 8px; align-items: baseline; font-size: 12px; font-weight: 800; color: #182A4E; margin-bottom: 6px; }
  .q-badge { font-size: 9px; font-weight: 700; color: #D98C0F; background: #FFF4DF; padding: 2px 8px; border-radius: 999px; }
  .q-text { font-size: 12px; line-height: 1.7; color: #33405E; }
  .q-img { max-width: 90%; margin-top: 6px; border-radius: 6px; border: 1px solid #E3E9F4; }
  .q-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 11.5px; color: #33405E; margin-top: 6px; }
  .q-blank { border-bottom: 1px dashed #C7D0E4; height: 26px; margin-top: 8px; width: 55%; }
  .q-blank.wide { width: 100%; height: 22px; }
`;

const ANSWERS_CSS = `
  .a-title { font-size: 16px; font-weight: 700; color: #182A4E; margin: 0 0 4px; }
  .a-sub { font-size: 11px; color: #7C88A6; margin: 0 0 16px; }
  .a-row { display: flex; gap: 10px; align-items: baseline; font-size: 12px; padding: 5px 0; border-bottom: 1px dotted #EEF2FA; }
  .a-num { font-weight: 800; color: #182A4E; width: 24px; }
  .a-val { font-weight: 700; color: #D98C0F; }
  .a-sol { margin-top: 4px; margin-left: 34px; color: #4A5A7A; font-size: 11px; line-height: 1.6; flex-basis: 100%; }
`;

function wrapDocument(css: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.4/dist/katex.min.css" />
<style>${BASE_CSS}${css}</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function headerHtml(worksheet: Worksheet): string {
  const dateStr = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `
    <div class="head">
      <span class="brand">PM <b>EDU</b></span>
      <span class="meta">${esc(worksheet.subject === "english" ? "영어" : "수학")}<br>${dateStr}</span>
    </div>`;
}

// 문제만 담긴 PDF — 학생이 손으로 풀 수 있게 답 적을 칸을 둔다. 정답은 들어가지 않는다.
export function buildProblemsHtml(worksheet: Worksheet, problems: Problem[]): string {
  const questionsHtml = problems
    .map(
      (p, i) => `
      <div class="q">
        <div class="q-head"><span class="q-num">${i + 1}.</span>${
          p.problem_format ? `<span class="q-badge">${esc(FORMAT_LABEL[p.problem_format] ?? p.problem_format)}</span>` : ""
        }</div>
        ${questionBodyHtml(p)}
        ${answerBlockHtml(p)}
      </div>`
    )
    .join("");

  const body = `
  <div class="page">
    ${headerHtml(worksheet)}
    <p class="title">${esc(worksheet.title)}</p>
    <p class="sub">이름 ___________________　　점수 _______ / ${problems.length}</p>
    ${questionsHtml}
    <p class="foot-brand">PM EDU · pmedu4u.com</p>
  </div>`;

  return wrapDocument(QUESTIONS_CSS, body);
}

// 정답·해설만 담긴 PDF — 문제지와 번호로 짝을 맞춰 보는 별도 문서.
export function buildAnswersHtml(worksheet: Worksheet, problems: Problem[]): string {
  const answersHtml = problems
    .map((p, i) => {
      const hasSolution = !!p.solution_text;
      return `
      <div class="a-row">
        <span class="a-num">${i + 1}.</span>
        <span class="a-val">${p.answer ? esc(p.answer) : "-"}</span>
        ${hasSolution ? `<div class="a-sol">${renderMathHtml(p.solution_text!)}</div>` : ""}
      </div>`;
    })
    .join("");

  const body = `
  <div class="page">
    ${headerHtml(worksheet)}
    <p class="title">${esc(worksheet.title)} · 정답 및 해설</p>
    <p class="sub">채점 후 틀린 문제는 해설을 먼저 읽고 다시 풀어보세요.</p>
    ${answersHtml}
    <p class="foot-brand">PM EDU · pmedu4u.com</p>
  </div>`;

  return wrapDocument(ANSWERS_CSS, body);
}

// 문제+정답이 한 파일에 같이 필요할 때(예: 관리자 미리보기)만 쓰는 합본.
export function buildWorksheetPrintHtml(worksheet: Worksheet, problems: Problem[]): string {
  const questionsHtml = problems
    .map(
      (p, i) => `
      <div class="q">
        <div class="q-head"><span class="q-num">${i + 1}.</span>${
          p.problem_format ? `<span class="q-badge">${esc(FORMAT_LABEL[p.problem_format] ?? p.problem_format)}</span>` : ""
        }</div>
        ${questionBodyHtml(p)}
        ${answerBlockHtml(p)}
      </div>`
    )
    .join("");

  const answersHtml = problems
    .map((p, i) => {
      const hasSolution = !!p.solution_text;
      return `
      <div class="a-row">
        <span class="a-num">${i + 1}.</span>
        <span class="a-val">${p.answer ? esc(p.answer) : "-"}</span>
        ${hasSolution ? `<div class="a-sol">${renderMathHtml(p.solution_text!)}</div>` : ""}
      </div>`;
    })
    .join("");

  const body = `
  <div class="page">
    ${headerHtml(worksheet)}
    <p class="title">${esc(worksheet.title)}</p>
    <p class="sub">이름 ___________________　　점수 _______ / ${problems.length}</p>
    ${questionsHtml}
    <p class="foot-brand">PM EDU · pmedu4u.com</p>
    <div class="answers" style="page-break-before: always; padding-top: 6mm;">
      <p class="a-title">정답 및 해설</p>
      <p class="a-sub">채점 후 틀린 문제는 해설을 먼저 읽고 다시 풀어보세요.</p>
      ${answersHtml}
    </div>
  </div>`;

  return wrapDocument(QUESTIONS_CSS + ANSWERS_CSS, body);
}
