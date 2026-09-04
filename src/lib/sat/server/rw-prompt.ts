import type { RwSkill } from "../taxonomy";
import { RW_SKILL_DESCRIPTIONS } from "./skill-descriptions";
import { FIGURE_KIND_EXAMPLES } from "./figure-prompt-hint";

/** scripts/sat/rw-topics.ts가 생성하는 소재 하나(주제×장르×시대 브리프). */
export interface RwTopic {
  id: string;
  topic: string;
  genre: string;
  era: string;
  seedPrompt: string;
}

export function buildRwPrompt(topic: RwTopic, skill: RwSkill): string {
  const needsFigure = skill === "command_of_evidence_quant";
  return `Write ONE Reading and Writing item for the Digital SAT.

Material brief (this passage must be written to match this brief — do not ignore it):
${topic.seedPrompt}

The question must test this skill: "${skill}" — ${RW_SKILL_DESCRIPTIONS[skill]}.

Passage length: 25 to 150 words.
${
  needsFigure
    ? `This skill REQUIRES a chart/table figure that the question refers to — invent simple data (bar_chart, scatter, or table — whichever fits) and put it under a "figure" field.\n${FIGURE_KIND_EXAMPLES}`
    : 'This skill does not need a figure — omit the "figure" field entirely.'
}

Return ONLY this JSON shape, filled in (no markdown fences, no extra text):
{
  "materialId": "${topic.id}",
  "stimulus": { "passageText": "..." },
  "question": {
    "skill": "${skill}",
    "difficulty": <1-5, your honest assessment>,
    "prompt": "...",
    "choices": ["...", "...", "...", "..."],
    "answerText": "<must be the exact text of one of the 4 choices above>",
    "explanationKo": "..."${needsFigure ? ',\n    "figure": { ...one of the shapes above... }' : ""}
  }
}`;
}
