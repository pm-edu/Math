// 각 스킬이 실제로 무엇을 묻는 문제인지 LLM에게 알려주는 짧은 영어 설명. taxonomy.ts의
// 한글 라벨은 사람(관리자 화면용)이고, 이건 생성 프롬프트용이라 따로 둔다.

import type { RwSkill, MathSkill } from "../taxonomy";

export const RW_SKILL_DESCRIPTIONS: Record<RwSkill, string> = {
  central_ideas: "identify the main idea or a key supporting detail of the passage",
  command_of_evidence_text: "choose the textual quotation that best supports a given claim about the passage",
  command_of_evidence_quant:
    "choose the data point or finding from an accompanying chart/table (a figure is required) that best supports or completes a claim",
  inferences: "draw the most logical inference or completion from the passage's information",
  words_in_context: "determine the best meaning of a specific word or phrase as it is used in context",
  text_structure_purpose: "identify the overall structure of the passage or the rhetorical purpose of a specific part",
  cross_text_connections:
    "given two short related passages (write both as part of the stimulus), identify how the two authors' views relate (agree, disagree, or one builds on the other)",
  rhetorical_synthesis:
    "given a set of bullet-point notes (write them as part of the stimulus, not flowing prose), choose the sentence that best accomplishes a stated rhetorical goal",
  transitions: "choose the best transition word or phrase to logically connect two given sentences",
  boundaries: "choose the correct punctuation to fix a sentence boundary (comma, semicolon, period, colon, etc.)",
  form_structure_sense: "choose the grammatically correct verb form, pronoun, or modifier placement for the sentence",
};

export const MATH_SKILL_DESCRIPTIONS: Record<MathSkill, string> = {
  linear_eq_1var: "solve or interpret a linear equation in one variable",
  linear_eq_2var: "solve or interpret a linear equation in two variables",
  linear_functions: "interpret or build a linear function or its graph",
  systems_linear: "solve a system of two linear equations",
  linear_inequalities: "solve or interpret a linear inequality or a system of linear inequalities",
  equivalent_expressions: "rewrite an algebraic expression into an equivalent form",
  nonlinear_eq_systems: "solve a nonlinear (e.g. quadratic) equation or a system involving one",
  nonlinear_functions: "interpret or build a nonlinear function (quadratic, exponential, etc.) or its graph",
  ratios_rates_units: "solve a ratio, rate, or unit-conversion word problem",
  percentages: "solve a percentage word problem",
  one_var_data:
    "interpret one-variable data (mean, median, range, standard deviation) — requires a table or bar_chart figure",
  two_var_data_scatter: "interpret a scatterplot or a two-variable data relationship — requires a scatter figure",
  probability: "compute a probability from given data",
  sample_inference_moe: "interpret sampling, margin of error, or statistical inference from a sample",
  evaluating_claims: "evaluate whether a statistical claim or conclusion is actually supported by the given data",
  area_volume: "compute the area or volume of a geometric figure — requires a figure",
  lines_angles_triangles: "solve for an angle or side relationship involving lines and triangles — requires a figure",
  right_tri_trig: "solve a right triangle problem using trigonometric ratios — requires a figure",
  circles: "solve a problem involving a circle's radius, arc, chord, or area — requires a figure",
};
