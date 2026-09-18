// RUN_MATH_SITE.md 6단계 B: 콘텐츠 결함 스캔(수정 아님, 목록만). scripts/scan-problems.ts와
// /api/study/problem-defects가 이 파일 하나를 같이 쓴다 — 스캔 기준을 두 곳에 따로 두지 않는다.

import katex from "katex";
import { parseSpr } from "@/lib/sat/spr";

export type DefectType =
  | "ai_residue"
  | "mcq_too_few_choices"
  | "mcq_duplicate_choices"
  | "mcq_correct_index_out_of_range"
  | "numeric_spec_invalid"
  | "empty_content"
  | "katex_render_error";

export interface DefectFinding {
  type: DefectType;
  detail: string;
}

export interface ScannableProblem {
  id: string;
  content_text: string | null;
  image_url: string | null;
  solution_text: string | null;
  choices: string[] | null;
  answer_format: "mcq" | "numeric" | "expression" | "free" | null;
  answer_spec: unknown;
}

// AI 생성 잔재 패턴 — 정규식 하나가 아니라 여러 개를 or로 묶는다(패턴별로 결함 사유를 남기려고).
const AI_RESIDUE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "확인 필요", re: /확인\s*필요/ },
  { label: "TODO", re: /TODO/i },
  { label: "다시 계산", re: /다시\s*계산/ },
  { label: "'아 ' 감탄사", re: /\s아\s/ },
  { label: "'음 ' 감탄사", re: /\s음\s/ },
  { label: "말줄임 3개 이상", re: /\.{3,}|…{2,}/ },
  { label: "영어 Note:", re: /Note:/ },
  { label: "영어 Let me", re: /Let me/ },
  { label: "영어 Wait", re: /\bWait\b/ },
];

function findAiResidue(text: string): string[] {
  const hits: string[] = [];
  for (const p of AI_RESIDUE_PATTERNS) {
    if (p.re.test(text)) hits.push(p.label);
  }
  return hits;
}

// ProblemBody.tsx의 렌더 대상과 같은 수식 추출 패턴.
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

function findKatexErrors(text: string): string[] {
  const errors: string[] = [];
  let m: RegExpExecArray | null;
  MATH_RE.lastIndex = 0;
  while ((m = MATH_RE.exec(text)) !== null) {
    const display = m[1] !== undefined || m[3] !== undefined;
    const latex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    try {
      // strict:'error'로 올려서 "$...$ 안에 한글이 그대로 들어간" 것 같은 경고성 문제도
      // 실패로 잡는다(기본값 'warn'은 콘솔에만 찍고 넘어가서 결함으로 안 잡힘).
      katex.renderToString(latex, { displayMode: display, throwOnError: true, strict: "error" });
    } catch (e) {
      errors.push(`"${latex.slice(0, 30)}" — ${e instanceof Error ? e.message.split("\n")[0] : "렌더 실패"}`);
    }
  }
  return errors;
}

export function detectDefects(p: ScannableProblem): DefectFinding[] {
  const findings: DefectFinding[] = [];

  const textFields = [p.content_text, p.solution_text, ...(p.choices ?? [])].filter((t): t is string => !!t);
  const combinedText = textFields.join("\n");

  const residueHits = findAiResidue(combinedText);
  if (residueHits.length > 0) {
    findings.push({ type: "ai_residue", detail: residueHits.join(", ") });
  }

  if (!p.content_text?.trim() && !p.image_url?.trim()) {
    findings.push({ type: "empty_content", detail: "content_text·image_url 둘 다 비어있음" });
  }

  if (p.answer_format === "mcq") {
    const spec = p.answer_spec as { choices?: unknown; correct_index?: unknown } | null;
    const choices = Array.isArray(spec?.choices) ? (spec!.choices as string[]) : p.choices ?? [];
    if (choices.length < 4) {
      findings.push({ type: "mcq_too_few_choices", detail: `보기 ${choices.length}개` });
    }
    const normalized = choices.map((c) => String(c).trim().toLowerCase().replace(/\s+/g, ""));
    if (new Set(normalized).size !== normalized.length) {
      findings.push({ type: "mcq_duplicate_choices", detail: "보기 중복" });
    }
    const correctIndex = typeof spec?.correct_index === "number" ? spec!.correct_index : null;
    if (correctIndex === null || correctIndex < 0 || correctIndex >= choices.length) {
      findings.push({ type: "mcq_correct_index_out_of_range", detail: `correct_index=${correctIndex}, 보기 ${choices.length}개` });
    }
  }

  if (p.answer_format === "numeric") {
    const spec = p.answer_spec as { value?: unknown } | null;
    const value = typeof spec?.value === "string" ? spec.value : null;
    if (!value || !value.trim()) {
      findings.push({ type: "numeric_spec_invalid", detail: "value 없음" });
    } else {
      const parsed = parseSpr(value.trim());
      if (!parsed.ok) findings.push({ type: "numeric_spec_invalid", detail: `파싱 불가: "${value}" (${parsed.reason})` });
    }
  }

  if (combinedText.trim()) {
    const katexErrors = findKatexErrors(combinedText);
    if (katexErrors.length > 0) {
      findings.push({ type: "katex_render_error", detail: katexErrors.join(" / ") });
    }
  }

  return findings;
}
