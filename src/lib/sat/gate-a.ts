// Gate A — 문항 생성 파이프라인의 결정론적 자동 검사 9규칙(지시서 SAT P1 §3).
// "폐기"는 DB에 넣지 않는다(discardRules). "보류"는 verified=false로 넣되 gate_flags에
// 사유를 남긴다(holdRules). 둘 다 없으면 insert.

import katex from "katex";
import { parseSpr } from "./spr";
import { renderFigureToSvg } from "./figure/render";
import type { FigureSpec } from "./figure/types";
import { findRealEntity } from "./real-entity-blocklist";
import {
  RwGeneratedItemSchema,
  MathGeneratedItemSchema,
  type RwGeneratedItem,
  type MathGeneratedItem,
} from "./generation-schemas";

export type GateRuleId = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9";

export interface GateAResult {
  verdict: "insert" | "discard" | "hold";
  discardRules: GateRuleId[];
  holdRules: GateRuleId[];
  item: RwGeneratedItem | MathGeneratedItem | null; // discard면 null(폐기는 애초에 못 쓰니까)
}

const FIGURE_REQUIRED_MATH_SKILLS = new Set([
  "area_volume",
  "lines_angles_triangles",
  "right_tri_trig",
  "circles",
  "two_var_data_scatter",
  "one_var_data",
]);

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasDuplicateChoice(choices: readonly string[]): boolean {
  const seen = new Set(choices.map((c) => c.trim().toLowerCase()));
  return seen.size !== choices.length;
}

function extractLatexSegments(text: string): string[] {
  const matches = text.match(/\$([^$]+)\$/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

/** A6: 모든 $...$ 가 KaTeX로 컴파일되는지. */
function allLatexCompiles(texts: string[]): boolean {
  for (const text of texts) {
    for (const seg of extractLatexSegments(text)) {
      try {
        katex.renderToString(seg, { throwOnError: true });
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** A9: 실존 인물·저작물 패턴이 없는지(휴리스틱 — 보류로만 씀). */
function hasRealEntity(texts: string[]): boolean {
  return texts.some((t) => findRealEntity(t) !== null);
}

/** A8: 도형이 필요한데 없거나, 있는데 렌더링이 실패하면 실패. */
function figureOk(figure: FigureSpec | undefined, figureRequired: boolean): boolean {
  if (figureRequired && !figure) return false;
  if (!figure) return true;
  try {
    renderFigureToSvg(figure);
    return true;
  } catch {
    return false;
  }
}

/** A7: 해설에 정답이 실제로 언급되는지(휴리스틱 — 보류로만 씀). */
function explanationMentionsAnswer(
  explanationKo: string,
  answer: { type: "mcq"; text: string } | { type: "spr"; accepted: string[] },
): boolean {
  if (answer.type === "mcq") {
    return explanationKo.includes(answer.text);
  }
  const numberLike = explanationKo.match(/-?\d+(\.\d+)?(\/\d+)?/g) ?? [];
  return numberLike.some((tok) => {
    const parsed = parseSpr(tok);
    if (!parsed.ok) return false;
    return answer.accepted.some((acceptedRaw) => {
      const acceptedParsed = parseSpr(acceptedRaw);
      return acceptedParsed.ok && acceptedParsed.value.n === parsed.value.n && acceptedParsed.value.d === parsed.value.d;
    });
  });
}

export function runGateA(raw: unknown, kind: "rw" | "math", context?: { mathSkill?: string }): GateAResult {
  const discardRules: GateRuleId[] = [];
  const holdRules: GateRuleId[] = [];

  // A1: zod 스키마
  const parsed =
    kind === "rw" ? RwGeneratedItemSchema.safeParse(raw) : MathGeneratedItemSchema.safeParse(raw);
  if (!parsed.success) {
    return { verdict: "discard", discardRules: ["A1"], holdRules: [], item: null };
  }

  if (kind === "rw") {
    const item = parsed.data as RwGeneratedItem;
    const { stimulus, question } = item;

    // A2: RW 지문 25-150 단어
    const wc = wordCount(stimulus.passageText);
    if (wc < 25 || wc > 150) discardRules.push("A2");

    // A3: 선택지 4개(스키마가 이미 tuple(4)로 강제) + 중복 텍스트 없음
    if (hasDuplicateChoice(question.choices)) discardRules.push("A3");

    // A4: 정답 텍스트가 선택지 안에 실제로 존재
    if (!question.choices.includes(question.answerText)) discardRules.push("A4");

    // A6: LaTeX 컴파일(RW는 보통 수식이 없지만 command_of_evidence_quant 등에서 등장 가능)
    if (!allLatexCompiles([question.prompt, question.explanationKo])) discardRules.push("A6");

    // A8: command_of_evidence_quant는 도표 스펙 필수 + 렌더 성공
    const figureRequired = question.skill === "command_of_evidence_quant";
    if (!figureOk(question.figure, figureRequired)) discardRules.push("A8");

    // A7 (보류): 해설에 정답이 실제로 언급되는지
    if (!explanationMentionsAnswer(question.explanationKo, { type: "mcq", text: question.answerText })) {
      holdRules.push("A7");
    }

    // A9 (보류): 실존 인물·저작물
    if (hasRealEntity([stimulus.passageText, question.prompt, question.explanationKo])) {
      holdRules.push("A9");
    }

    const verdict = discardRules.length > 0 ? "discard" : holdRules.length > 0 ? "hold" : "insert";
    return { verdict, discardRules, holdRules, item: verdict === "discard" ? null : item };
  }

  const item = parsed.data as MathGeneratedItem;

  // A6: LaTeX 컴파일
  const texts = [item.prompt, item.explanationKo];
  if (!allLatexCompiles(texts)) discardRules.push("A6");

  // A8: 도형이 필요한 스킬(geometry_trig 전체, two_var_data_scatter, one_var_data)은 필수 + 렌더 성공.
  const figureRequired = context?.mathSkill ? mathSkillRequiresFigure(context.mathSkill) : false;
  if (!figureOk(item.figure, figureRequired)) discardRules.push("A8");

  if (item.format === "mcq") {
    // A3
    if (hasDuplicateChoice(item.choices)) discardRules.push("A3");
    // A4
    if (!item.choices.includes(item.answerText)) discardRules.push("A4");
    // A7 (보류)
    if (!explanationMentionsAnswer(item.explanationKo, { type: "mcq", text: item.answerText })) holdRules.push("A7");
  } else {
    // A5: SPR accepted가 P0 파서로 파싱되는지
    const allParse = item.sprAccepted.every((raw) => parseSpr(raw).ok);
    if (!allParse) discardRules.push("A5");
    // A7 (보류)
    if (allParse && !explanationMentionsAnswer(item.explanationKo, { type: "spr", accepted: item.sprAccepted })) {
      holdRules.push("A7");
    }
  }

  // A9 (보류)
  if (hasRealEntity(texts)) holdRules.push("A9");

  const verdict = discardRules.length > 0 ? "discard" : holdRules.length > 0 ? "hold" : "insert";
  return { verdict, discardRules, holdRules, item: verdict === "discard" ? null : item };
}

/** Math 배치에서 스킬이 도형을 반드시 요구하는지(호출부가 스킬 단위로 배치를 도니까 여기서 노출). */
export function mathSkillRequiresFigure(skill: string): boolean {
  return FIGURE_REQUIRED_MATH_SKILLS.has(skill);
}
