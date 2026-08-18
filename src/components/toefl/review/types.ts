import type { ToeflScoringMode, ToeflSection, ToeflTaskType } from "@/lib/toefl/types";

// GET /api/toefl/attempts/[id]/review 응답 모양. 라우트가 이미 조인·서명URL까지 다 끝낸 값만
// 보내주므로, 이 화면들은 여기서 다시 계산/조인하지 않는다(요청: 클라이언트 재계산 금지).

export type ReviewStimulus = {
  id: string;
  module_id: string;
  task_type: ToeflTaskType;
  title: string | null;
  body: string | null;
  audio_path: string | null;
  transcript: string | null;
  audio_duration_sec: number | null;
  image_path: string | null;
  position: number;
};

export type ReviewResponse = {
  answer: unknown;
  audio_path: string | null;
  transcript: string | null;
  is_correct: boolean | null;
  points_earned: number | null;
};

export type ReviewAiScore = { rubric: Record<string, unknown>; overall: number; feedback_ko: string };

export type ReviewItem = {
  id: string;
  section: ToeflSection;
  task_type: ToeflTaskType;
  position: number;
  points: number;
  scoring_mode: ToeflScoringMode;
  prompt: string;
  payload: Record<string, unknown>;
  answer_key: Record<string, unknown> | null;
  explanation_ko: string | null;
  vocab_ids: string[];
  stimulus: ReviewStimulus | null;
  response: ReviewResponse | null;
  ai_score: ReviewAiScore | null;
  review_status: "graded" | "pending_manual" | "unanswered";
};
