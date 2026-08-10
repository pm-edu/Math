export const CATEGORIES = ["초등", "중등", "고등", "IB"] as const;
export const DIFFICULTIES = ["하", "중", "상"] as const;

export type Problem = {
  id: string;
  category: string;
  unit: string | null;
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
