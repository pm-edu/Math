// TOEFL 스키마 TypeScript 타입. docs/toefl-spec.md §4, §5, §6 그대로.
// 이 프로젝트는 supabase gen types(CLI 연동)를 안 쓰고 다른 테이블들처럼(예: src/lib/problems.ts)
// 손으로 타입을 맞춰 쓰는 관례라 이 파일도 그 방식을 따른다 — DB 마이그레이션과 항상 같이 수정할 것.

export type ToeflSection = "reading" | "listening" | "speaking" | "writing";

export type ToeflTaskType =
  | "complete_the_words"
  | "daily_life"
  | "academic_passage"
  | "choose_a_response"
  | "conversation"
  | "announcement"
  | "academic_talk"
  | "listen_and_repeat"
  | "take_an_interview"
  | "build_a_sentence"
  | "write_an_email"
  | "academic_discussion";

export type ToeflStage = "stage1" | "stage2";
export type ToeflRoute = "base" | "easy" | "hard";
export type ToeflScoringMode = "auto_key" | "auto_sequence" | "auto_transcript" | "ai_rubric";
export type ToeflAttemptStatus = "in_progress" | "submitted" | "scored" | "abandoned";
export type ToeflAttemptMode = "full" | "section_practice";

export type ToeflFormBlueprint = {
  id: string;
  version: string;
  section: ToeflSection;
  stage: ToeflStage;
  route: ToeflRoute;
  time_limit_sec: number;
  item_count: number;
  task_mix: Record<string, number>; // 문항 유형별 개수 + (stage1/base면) routing_threshold
  is_active: boolean;
};

export type ToeflForm = {
  id: string;
  code: string;
  title: string;
  blueprint_version: string;
  is_published: boolean;
  created_at: string;
};

export type ToeflModule = {
  id: string;
  form_id: string;
  section: ToeflSection;
  stage: ToeflStage;
  route: ToeflRoute;
  position: number;
};

export type ToeflStimulus = {
  id: string;
  module_id: string;
  task_type: ToeflTaskType;
  title: string | null;
  body: string | null;
  audio_path: string | null;
  transcript: string | null; // toefl_stimulus_public 뷰에는 없음 — 응시 중 학생에게 노출 금지
  audio_duration_sec: number | null;
  image_path: string | null;
  position: number;
  metadata: Record<string, unknown>;
};

// 학생 응시 화면에서 쓰는 버전 (toefl_stimulus_public 뷰) — transcript 없음
export type ToeflStimulusPublic = Omit<ToeflStimulus, "transcript">;

export type ToeflItem = {
  id: string;
  module_id: string;
  stimulus_id: string | null;
  task_type: ToeflTaskType;
  position: number;
  difficulty: number; // 1~5
  points: number;
  scoring_mode: ToeflScoringMode;
  prompt: string;
  payload: ToeflItemPayload;
  answer_key: ToeflAnswerKey | null; // ai_rubric이면 null
  explanation_ko: string | null;
  explanation_en: string | null;
  skill_tags: string[];
  vocab_ids: string[];
  created_at: string;
};

// 학생 응시 화면에서 쓰는 버전 (toefl_item_public 뷰) — answer_key/explanation_* 없음
export type ToeflItemPublic = Pick<
  ToeflItem,
  "id" | "module_id" | "stimulus_id" | "task_type" | "position" | "difficulty" | "points" | "scoring_mode" | "prompt" | "payload" | "created_at"
>;

export type ToeflAttempt = {
  id: string;
  user_id: string;
  form_id: string;
  mode: ToeflAttemptMode;
  status: ToeflAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  scored_at: string | null;
  overall_band: number | null;
  total_scaled: number | null;
};

export type ToeflSectionAttempt = {
  id: string;
  attempt_id: string;
  section: ToeflSection;
  started_at: string | null;
  deadline_at: string | null; // 서버 권위 타이머 — 클라이언트는 표시만
  finished_at: string | null;
  stage1_raw: number | null;
  routed_to: ToeflRoute | null;
  raw_score: number | null;
  scaled_score: number | null; // 0-30
  band: number | null; // 1.0-6.0
};

export type ToeflResponse = {
  id: string;
  attempt_id: string;
  item_id: string;
  answer: ToeflAnswer | null;
  audio_path: string | null;
  transcript: string | null;
  time_spent_ms: number | null;
  is_correct: boolean | null;
  points_earned: number | null;
  answered_at: string;
};

export type ToeflAiScore = {
  id: string;
  response_id: string;
  model: string;
  rubric: Record<string, number>; // {"delivery":3.5, ...}
  overall: number;
  feedback_ko: string;
  feedback_en: string | null;
  raw_output: unknown;
  created_at: string;
};

export type ToeflScaleConversion = {
  id: string;
  version: string;
  section: ToeflSection;
  route: ToeflRoute;
  raw_min: number; // 지금은 "만점 대비 백분율" 기준 (마이그레이션 202608151202 참고)
  raw_max: number;
  scaled: number;
  band: number;
};

export type ToeflVocabLevelMap = {
  id: string;
  vocab_level: number; // 기존 단어 완전학습 Lv0~5
  min_band: number;
};

// ── 문항 유형별 payload/answer_key/answer 구조 (spec §6) ──
// 여기서 벗어나는 구조를 쓰면 채점 엔진이 깨진다 — 반드시 이 타입을 거쳐서만 다룰 것.

export type CompleteTheWordsPayload = {
  paragraph: string;
  blanks: { id: string; masked: string; length: number }[];
};
export type CompleteTheWordsAnswerKey = Record<string, string>; // { b1: "economy" }

export type McqOption = { id: string; text: string };
export type ReadingMcqPayload = {
  format: "mcq" | "multi_select" | "insert_text";
  options: McqOption[];
  select_count?: number;
  insert_positions?: string[]; // insert_text 전용
};
export type ReadingMcqAnswerKey = { correct: string[] };
export type ReadingMcqAnswer = { selected: string[] };

export type ListeningChoosePayload = { clip_path: string | null; options: McqOption[] };
export type ListeningStimulusItemPayload = {
  format: "mcq" | "multi_select" | "replay";
  replay_start_sec?: number;
  replay_end_sec?: number;
  options: McqOption[];
};
export type ListeningAnswerKey = { correct: string[] };

export type ListenAndRepeatPayload = { clip_path: string | null; target_sentence: string; response_window_sec: number };
export type ListenAndRepeatAnswerKey = { target_sentence: string };

export type TakeAnInterviewPayload = {
  video_path: string | null;
  question_audio_path: string | null;
  prep_sec: number;
  response_sec: number;
  turn_type: "opinion" | "compare" | "hypothetical";
};

export type BuildASentencePayload = { chunks: { id: string; text: string }[] };
export type BuildASentenceAnswerKey = { order: string[]; accepted_alternatives: string[][] };
export type BuildASentenceAnswer = { order: string[] };

export type WriteAnEmailPayload = { scenario: string; required_points: string[]; word_min: number; word_max: number };
export type AcademicDiscussionPayload = {
  professor_post: string;
  student_posts: { name: string; text: string }[];
  word_min: number;
  word_max: number;
};

export type ToeflItemPayload =
  | CompleteTheWordsPayload
  | ReadingMcqPayload
  | ListeningChoosePayload
  | ListeningStimulusItemPayload
  | ListenAndRepeatPayload
  | TakeAnInterviewPayload
  | BuildASentencePayload
  | WriteAnEmailPayload
  | AcademicDiscussionPayload;

export type ToeflAnswerKey =
  | CompleteTheWordsAnswerKey
  | ReadingMcqAnswerKey
  | ListeningAnswerKey
  | ListenAndRepeatAnswerKey
  | BuildASentenceAnswerKey;

export type ToeflAnswer = CompleteTheWordsAnswerKey | ReadingMcqAnswer | BuildASentenceAnswer | Record<string, unknown>;

// ── AI 루브릭 채점 응답 (spec §12, Writing) ──
export type WritingRubricScore = {
  task_achievement: number;
  coherence: number;
  lexical_resource: number;
  grammar: number;
  overall_band: number;
  feedback_ko: string;
  strengths: string[];
  improvements: string[];
  corrected_excerpts: { original: string; corrected: string; reason_ko: string }[];
};

// ── AI 루브릭 채점 응답 (spec §12, Speaking take_an_interview) ──
export type InterviewRubricScore = {
  delivery: number;
  language_use: number;
  topic_development: number;
  overall_band: number;
  feedback_ko: string;
  strengths: string[];
  improvements: string[];
};
