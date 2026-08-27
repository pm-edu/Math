// DB에 저장된 값(answer_key, answer, payload)의 실제 형태를 런타임에 확인하는 스키마.
//
// 이 프로젝트는 아직 supabase gen types를 안 쓴다(types.ts 주석 참고, package.json의
// db:generate-types 스크립트로 준비는 해뒀지만 Supabase 프로젝트 접근 권한이 있는 사용자가
// 한 번 `supabase login`·`link`를 해야 실제로 돌아간다 — 2026-08-27 교차검증 C1). 그래서
// DB 컬럼(jsonb)은 여전히 타입 시스템 상 unknown으로 들어온다. 예전엔 이걸 `as`로 우기고
// 넘어갔는데(교차검증 C2 지적), 여기 스키마들로 실제로 확인한다.
//
// types.ts의 손으로 쓴 타입과 구조가 1:1로 대응해야 한다 — 타입을 바꾸면 여기도 같이 바꿀 것.

import { z } from "zod";

export const completeTheWordsAnswerKeySchema = z.record(z.string(), z.string());
export const mcqAnswerKeySchema = z.object({ correct: z.array(z.string()) });
export const buildASentenceAnswerKeySchema = z.object({
  order: z.array(z.string()),
  accepted_alternatives: z.array(z.array(z.string())).optional(),
});
export const listenAndRepeatAnswerKeySchema = z.object({ target_sentence: z.string() });

export const writeAnEmailPayloadSchema = z.object({
  scenario: z.string(),
  required_points: z.array(z.string()),
  word_min: z.number(),
  word_max: z.number(),
});
export const academicDiscussionPayloadSchema = z.object({
  professor_post: z.string(),
  student_posts: z.array(z.object({ name: z.string(), text: z.string() })),
  word_min: z.number(),
  word_max: z.number(),
});
export const takeAnInterviewPayloadSchema = z.object({
  video_path: z.string().nullable(),
  question_audio_path: z.string().nullable(),
  prep_sec: z.number(),
  response_sec: z.number(),
  turn_type: z.enum(["opinion", "compare", "hypothetical"]),
});
export const listenAndRepeatPayloadSchema = z.object({
  clip_path: z.string().nullable(),
  target_sentence: z.string(),
  response_window_sec: z.number(),
});

// responses route가 toefl_item을 조회한 뒤 scoreItem에 넘기기 전 검증하는 데 쓴다 — task_type/
// scoring_mode를 리터럴 유니온으로 좁혀서, 예전처럼 "as ScoreableItem"으로 통째로 우기지 않는다.
export const scoreableDbItemSchema = z.object({
  id: z.string(),
  task_type: z.enum([
    "complete_the_words",
    "daily_life",
    "academic_passage",
    "choose_a_response",
    "conversation",
    "announcement",
    "academic_talk",
    "listen_and_repeat",
    "take_an_interview",
    "build_a_sentence",
    "write_an_email",
    "academic_discussion",
  ]),
  scoring_mode: z.enum(["auto_key", "auto_sequence", "auto_transcript", "ai_rubric"]),
  points: z.number(),
  answer_key: z.unknown().nullable(),
  payload: z.unknown(),
});
