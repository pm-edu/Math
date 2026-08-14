// 수학(subject='math') 전용 커리큘럼 분류. 영어는 기존 category/course_level을 그대로 쓴다.
// 1차: curriculum_group, 2차: curriculum_detail(1차에 종속). 새 교육과정만 반영(구교육과정 병행 트랙은 제외).

export type CurriculumGroup = "KR" | "IB" | "IGCSE" | "CBSE" | "AS_A_Level";

export type CurriculumOption = { value: string; label: string };

export const CURRICULUM_GROUPS: { value: CurriculumGroup; label: string }[] = [
  { value: "KR", label: "한국" },
  { value: "IB", label: "IB" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "CBSE", label: "CBSE" },
  { value: "AS_A_Level", label: "AS/A-Level" },
];

const KR_DETAILS: CurriculumOption[] = [
  "초1", "초2", "초3", "초4", "초5", "초6",
  "중1", "중2", "중3",
  "공통수학1", "공통수학2",
  "대수", "미적분Ⅰ", "확률과 통계",
  "기하", "미적분Ⅱ", "경제 수학", "인공지능 수학",
  "실용 통계", "수학과제 탐구",
].map((v) => ({ value: v, label: v }));

const IB_DETAILS: CurriculumOption[] = [
  { value: "IB_AA_HL", label: "AA HL" },
  { value: "IB_AA_SL", label: "AA SL" },
  { value: "IB_AI_HL", label: "AI HL" },
  { value: "IB_AI_SL", label: "AI SL" },
];

const IGCSE_DETAILS: CurriculumOption[] = [
  { value: "IGCSE_0607", label: "0607" },
  { value: "IGCSE_0580", label: "0580" },
];

const CBSE_DETAILS: CurriculumOption[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    value: `CBSE_Class${i + 1}`,
    label: `Class ${i + 1}`,
  })),
  { value: "CBSE_Class11_Maths", label: "Class 11 Maths" },
  { value: "CBSE_Class11_AppliedMaths", label: "Class 11 Applied Maths" },
  { value: "CBSE_Class12_Maths", label: "Class 12 Maths" },
  { value: "CBSE_Class12_AppliedMaths", label: "Class 12 Applied Maths" },
];

const AS_A_LEVEL_DETAILS: CurriculumOption[] = [
  { value: "AS_A_Level_P1", label: "P1" },
  { value: "AS_A_Level_P2", label: "P2" },
  { value: "AS_A_Level_P3", label: "P3" },
  { value: "AS_A_Level_M1", label: "M1" },
  { value: "AS_A_Level_S1", label: "S1" },
  { value: "AS_A_Level_S2", label: "S2" },
];

export const CURRICULUM_DETAILS: Record<CurriculumGroup, CurriculumOption[]> = {
  KR: KR_DETAILS,
  IB: IB_DETAILS,
  IGCSE: IGCSE_DETAILS,
  CBSE: CBSE_DETAILS,
  AS_A_Level: AS_A_LEVEL_DETAILS,
};

export function curriculumGroupLabel(value: string | null): string {
  return CURRICULUM_GROUPS.find((g) => g.value === value)?.label ?? value ?? "";
}

export function curriculumDetailLabel(group: string | null, detail: string | null): string {
  if (!group || !detail) return detail ?? "";
  const list = CURRICULUM_DETAILS[group as CurriculumGroup];
  return list?.find((d) => d.value === detail)?.label ?? detail;
}
