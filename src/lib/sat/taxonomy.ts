// SAT 스킬 분류 기준점. 문항 태깅·리포트·약점 분석·생성 파이프라인이 전부 여기를 참조한다.
// 도메인·스킬 키는 지시서(SAT P0 §1)에서 확정된 값이며 임의로 추가/변경하지 않는다.

export const RW_DOMAINS = [
  "information_ideas",
  "craft_structure",
  "expression_of_ideas",
  "standard_conventions",
] as const;
export type RwDomain = (typeof RW_DOMAINS)[number];

export const MATH_DOMAINS = [
  "algebra",
  "advanced_math",
  "problem_solving_data",
  "geometry_trig",
] as const;
export type MathDomain = (typeof MATH_DOMAINS)[number];

export const SAT_DOMAINS = [...RW_DOMAINS, ...MATH_DOMAINS] as const;
export type SatDomain = (typeof SAT_DOMAINS)[number];

export const RW_SKILLS = [
  { key: "central_ideas", domain: "information_ideas", labelKo: "중심 생각과 세부 정보" },
  { key: "command_of_evidence_text", domain: "information_ideas", labelKo: "근거 찾기 (텍스트)" },
  { key: "command_of_evidence_quant", domain: "information_ideas", labelKo: "근거 찾기 (도표)" },
  { key: "inferences", domain: "information_ideas", labelKo: "추론" },
  { key: "words_in_context", domain: "craft_structure", labelKo: "문맥 속 어휘" },
  { key: "text_structure_purpose", domain: "craft_structure", labelKo: "구조와 목적" },
  { key: "cross_text_connections", domain: "craft_structure", labelKo: "두 지문 연결" },
  { key: "rhetorical_synthesis", domain: "expression_of_ideas", labelKo: "노트 종합" },
  { key: "transitions", domain: "expression_of_ideas", labelKo: "연결어" },
  { key: "boundaries", domain: "standard_conventions", labelKo: "문장 경계" },
  { key: "form_structure_sense", domain: "standard_conventions", labelKo: "형태·구조·의미" },
] as const satisfies readonly { key: string; domain: RwDomain; labelKo: string }[];

export const MATH_SKILLS = [
  { key: "linear_eq_1var", domain: "algebra", labelKo: "일차방정식 (미지수 1개)" },
  { key: "linear_eq_2var", domain: "algebra", labelKo: "일차방정식 (미지수 2개)" },
  { key: "linear_functions", domain: "algebra", labelKo: "일차함수" },
  { key: "systems_linear", domain: "algebra", labelKo: "연립일차방정식" },
  { key: "linear_inequalities", domain: "algebra", labelKo: "일차부등식" },
  { key: "equivalent_expressions", domain: "advanced_math", labelKo: "동치식" },
  { key: "nonlinear_eq_systems", domain: "advanced_math", labelKo: "비선형 방정식·연립" },
  { key: "nonlinear_functions", domain: "advanced_math", labelKo: "비선형함수" },
  { key: "ratios_rates_units", domain: "problem_solving_data", labelKo: "비·비율·단위" },
  { key: "percentages", domain: "problem_solving_data", labelKo: "백분율" },
  { key: "one_var_data", domain: "problem_solving_data", labelKo: "일변량 자료" },
  { key: "two_var_data_scatter", domain: "problem_solving_data", labelKo: "이변량 자료·산점도" },
  { key: "probability", domain: "problem_solving_data", labelKo: "확률" },
  { key: "sample_inference_moe", domain: "problem_solving_data", labelKo: "표본 추론·오차범위" },
  { key: "evaluating_claims", domain: "problem_solving_data", labelKo: "통계적 주장 평가" },
  { key: "area_volume", domain: "geometry_trig", labelKo: "넓이와 부피" },
  { key: "lines_angles_triangles", domain: "geometry_trig", labelKo: "직선·각·삼각형" },
  { key: "right_tri_trig", domain: "geometry_trig", labelKo: "직각삼각형과 삼각비" },
  { key: "circles", domain: "geometry_trig", labelKo: "원" },
] as const satisfies readonly { key: string; domain: MathDomain; labelKo: string }[];

export const SAT_SKILLS = [...RW_SKILLS, ...MATH_SKILLS] as const;

export type RwSkill = (typeof RW_SKILLS)[number]["key"];
export type MathSkill = (typeof MATH_SKILLS)[number]["key"];
export type SatSkill = (typeof SAT_SKILLS)[number]["key"];

export const RW_SKILL_COUNT = RW_SKILLS.length;
export const MATH_SKILL_COUNT = MATH_SKILLS.length;
export const SAT_SKILL_COUNT = SAT_SKILLS.length;

const SKILL_TO_DOMAIN = Object.fromEntries(
  SAT_SKILLS.map((s) => [s.key, s.domain]),
) as Record<SatSkill, SatDomain>;

const SKILL_TO_LABEL_KO = Object.fromEntries(
  SAT_SKILLS.map((s) => [s.key, s.labelKo]),
) as Record<SatSkill, string>;

export function skillToDomain(skill: SatSkill): SatDomain {
  return SKILL_TO_DOMAIN[skill];
}

export function skillLabelKo(skill: SatSkill): string {
  return SKILL_TO_LABEL_KO[skill];
}
