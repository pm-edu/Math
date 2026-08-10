export const CATEGORIES = ["초등", "중등", "고등", "IB"] as const;
export const DIFFICULTIES = ["하", "중", "상"] as const;
export const FORMATS = ["객관식", "서술형", "단답형"] as const;

export type Problem = {
  id: string;
  category: string;
  course_level: string | null; // 과정 (예: 고2 미적분, 수능특강, IB HL)
  unit: string | null;
  problem_format: string | null; // 유형 (객관식/서술형/단답형)
  difficulty: string;
  answer: string | null;
  image_url: string;
  solution_image_url: string | null;
  memo: string | null;
  problem_type: string;
  choices: string[] | null;
  created_at: string;
};

export type Worksheet = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};
