import type { MathSkill } from "../taxonomy";
import { MATH_SKILL_DESCRIPTIONS } from "./skill-descriptions";
import { mathSkillRequiresFigure } from "../gate-a";
import { FIGURE_KIND_EXAMPLES } from "./figure-prompt-hint";

const SPR_HINT_JSON = `{"difficulty":3,"format":"spr","prompt":"...","sprAccepted":["7/2"],"explanationKo":"..."}`;
const MCQ_HINT_JSON = `{"difficulty":3,"format":"mcq","prompt":"...","choices":["...","...","...","..."],"answerText":"<one of the 4 choices, exact text>","explanationKo":"..."}`;

/** 스킬 1개 배치(난이도 1~5 × 각 4문항 = 20문항, 배치 전체에서 SPR ~25%). */
export function buildMathPrompt(skill: MathSkill): string {
  const requiresFigure = mathSkillRequiresFigure(skill);
  return `Write a batch of 20 Math items for the Digital SAT, all testing this skill: "${skill}" — ${MATH_SKILL_DESCRIPTIONS[skill]}.

Produce exactly 4 items at EACH difficulty level 1, 2, 3, 4, 5 (20 items total).

Across the full batch of 20, about 5 items (~25%) should have "format":"spr" (grid-in — a single rational number as the answer, given in "sprAccepted" as strings like "7/2" or "0.5"). Do NOT force exactly one spr item per difficulty level — distribute them however feels natural across the batch (e.g. 0 in one tier, 2 in another). The rest must have "format":"mcq" with exactly 4 choices and one exact "answerText".

${
  requiresFigure
    ? `This skill REQUIRES a figure. Every item must include a "figure" field — invent simple, consistent numeric values. Never omit it for this skill.\n${FIGURE_KIND_EXAMPLES}`
    : `This skill does not require a figure — omit the "figure" field unless the specific item genuinely needs a coordinate_plane or table to state the problem (if so, follow the same shapes:\n${FIGURE_KIND_EXAMPLES})`
}

Return ONLY this JSON shape, filled in (no markdown fences, no extra text):
{
  "skill": "${skill}",
  "items": [
    ${MCQ_HINT_JSON},
    ${SPR_HINT_JSON}
    /* ... 20 items total, in any order, each matching one of the two shapes above ... */
  ]
}`;
}
