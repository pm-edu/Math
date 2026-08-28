import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreItem, aiRubricToPoints } from "../scoring";
import { gradeWritingResponse } from "./ai-grading";
import { gradeInterviewAudio, scoreListenAndRepeatFromTranscript, transcribeAudio } from "./audio-grading";
import { signItemPayloadAudio, signStimulusAudio } from "./sign-audio";
import { shuffle } from "./modules";
import {
  academicDiscussionPayloadSchema,
  listenAndRepeatPayloadSchema,
  scoreableDbItemSchema,
  takeAnInterviewPayloadSchema,
  writeAnEmailPayloadSchema,
} from "../zod-schemas";
import type { ToeflTaskType } from "../types";

// 랜딩(/toefl §types)의 "유형별 연습" — 정식 응시(toefl_attempt)와 완전히 분리된 가벼운 연습
// 모드다. toefl-subsystem-plan 메모 2026-08-28 결정사항: (1) 결과를 toefl_practice_response에
// 저장, (2) 비로그인 게스트도 오디오/녹음 유형 포함 12유형 전부 접근 가능.

const ITEM_SELECT_COLUMNS = "id, module_id, stimulus_id, task_type, position, difficulty, points, scoring_mode, prompt, payload, created_at";
const STIMULUS_SELECT_COLUMNS = "id, module_id, task_type, title, body, audio_path, audio_duration_sec, image_path, position, metadata";

export type PracticeItemRow = {
  id: string;
  module_id: string;
  stimulus_id: string | null;
  task_type: ToeflTaskType;
  position: number;
  difficulty: number;
  points: number;
  scoring_mode: string;
  prompt: string;
  payload: unknown;
  created_at: string;
};

export type PracticeStimulusRow = {
  id: string;
  module_id: string;
  task_type: ToeflTaskType;
  title: string | null;
  body: string | null;
  audio_path: string | null;
  audio_duration_sec: number | null;
  image_path: string | null;
  position: number;
  metadata: Record<string, unknown>;
};

// 게시된 폼에 속한 문항 중 이 유형만 무작위로 몇 개 뽑는다(정식 응시처럼 attempt별 고정 조합을
// 저장해둘 필요가 없다 — 매번 새로 풀어보는 것 자체가 연습의 목적이라 매 요청마다 다시 뽑는다).
// answer_key/explanation_*는 select 목록에 아예 없다(§5와 같은 원칙, /sample과 동일 패턴).
export async function pickPracticeItems(
  service: SupabaseClient,
  taskType: ToeflTaskType,
  limit: number
): Promise<{ items: PracticeItemRow[]; stimuli: PracticeStimulusRow[] }> {
  const { data: forms } = await service.from("toefl_form").select("id").eq("is_published", true);
  const formIds = (forms ?? []).map((f) => f.id as string);
  if (formIds.length === 0) return { items: [], stimuli: [] };

  const { data: modules } = await service.from("toefl_module").select("id").in("form_id", formIds);
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return { items: [], stimuli: [] };

  const { data: itemRows } = await service
    .from("toefl_item")
    .select(ITEM_SELECT_COLUMNS)
    .in("module_id", moduleIds)
    .eq("task_type", taskType)
    .eq("is_active", true);

  const picked = shuffle((itemRows ?? []) as PracticeItemRow[]).slice(0, limit);

  const stimulusIds = [...new Set(picked.map((it) => it.stimulus_id).filter((v): v is string => !!v))];
  const { data: stimulusRows } = stimulusIds.length
    ? await service.from("toefl_stimulus").select(STIMULUS_SELECT_COLUMNS).in("id", stimulusIds)
    : { data: [] as PracticeStimulusRow[] };

  const [items, stimuli] = await Promise.all([
    Promise.all(picked.map((it) => signItemPayloadAudio(service, it))),
    Promise.all(((stimulusRows ?? []) as PracticeStimulusRow[]).map((s) => signStimulusAudio(service, s))),
  ]);

  return { items, stimuli };
}

export type PracticeScoreInput = { answer?: unknown; audioBase64?: string; mimeType?: string };

export type PracticeScoreResult = {
  isCorrect: boolean | null;
  pointsEarned: number;
  transcript?: string;
  feedbackKo?: string;
  rubric?: Record<string, number>;
  error?: string;
};

export type PracticeGradableItem = {
  id: string;
  task_type: string;
  scoring_mode: string;
  points: number;
  prompt: string;
  payload: unknown;
  answer_key: unknown;
};

// 문항 하나 채점 — attempts/[id]/sections/[section]/finish의 gradeSingleResponse와 로직은
// 같지만(같은 채점 함수를 그대로 재사용, 아래 각 분기 참고), toefl_response 행에 update하는
// 대신 결과를 그 자리에서 리턴한다(연습은 attempt/response 자체가 없어서). DB 저장(연습 기록)은
// 호출부(API 라우트)가 이 결과를 받아 toefl_practice_response에 insert하는 방식으로 나눴다.
export async function scorePracticeItem(item: PracticeGradableItem, input: PracticeScoreInput): Promise<PracticeScoreResult> {
  if (item.task_type === "write_an_email" || item.task_type === "academic_discussion") {
    const text = ((input.answer as { text?: string } | undefined)?.text ?? "").trim();
    if (!text) return { isCorrect: null, pointsEarned: 0 };

    const payloadSchema = item.task_type === "write_an_email" ? writeAnEmailPayloadSchema : academicDiscussionPayloadSchema;
    const payloadParsed = payloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) return { isCorrect: null, pointsEarned: 0, error: "문항 데이터 형식이 올바르지 않습니다." };

    const result = await gradeWritingResponse({
      taskType: item.task_type,
      prompt: item.prompt,
      payload: payloadParsed.data,
      responseText: text,
    });
    if (!result.ok) return { isCorrect: null, pointsEarned: 0, error: result.message };

    return {
      isCorrect: null,
      pointsEarned: aiRubricToPoints(result.rubric.overall_band, Number(item.points)),
      feedbackKo: result.rubric.feedback_ko,
      rubric: {
        overall_band: result.rubric.overall_band,
        task_achievement: result.rubric.task_achievement,
        coherence: result.rubric.coherence,
        lexical_resource: result.rubric.lexical_resource,
        grammar: result.rubric.grammar,
      },
    };
  }

  if (item.task_type === "take_an_interview") {
    if (!input.audioBase64) return { isCorrect: null, pointsEarned: 0, error: "녹음이 없습니다." };
    const payloadParsed = takeAnInterviewPayloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) return { isCorrect: null, pointsEarned: 0, error: "문항 데이터 형식이 올바르지 않습니다." };

    const result = await gradeInterviewAudio({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType ?? "audio/webm",
      question: item.prompt,
      turnType: payloadParsed.data.turn_type,
    });
    if (!result.ok) return { isCorrect: null, pointsEarned: 0, error: result.message };

    return {
      isCorrect: null,
      pointsEarned: aiRubricToPoints(result.rubric.overall_band, Number(item.points)),
      feedbackKo: result.rubric.feedback_ko,
      rubric: {
        overall_band: result.rubric.overall_band,
        delivery: result.rubric.delivery,
        language_use: result.rubric.language_use,
        topic_development: result.rubric.topic_development,
      },
    };
  }

  if (item.task_type === "listen_and_repeat") {
    if (!input.audioBase64) return { isCorrect: null, pointsEarned: 0, error: "녹음이 없습니다." };
    const payloadParsed = listenAndRepeatPayloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) return { isCorrect: null, pointsEarned: 0, error: "문항 데이터 형식이 올바르지 않습니다." };

    const sttResult = await transcribeAudio(input.audioBase64, input.mimeType ?? "audio/webm");
    if (!sttResult.ok) return { isCorrect: null, pointsEarned: 0, error: sttResult.message };

    const { isCorrect, pointsEarned } = scoreListenAndRepeatFromTranscript(
      payloadParsed.data.target_sentence,
      Number(item.points),
      sttResult.transcript
    );
    return { isCorrect, pointsEarned, transcript: sttResult.transcript };
  }

  // auto_key / auto_sequence(complete_the_words, mcq류, build_a_sentence) — 순수함수라 즉시 채점.
  const parsed = scoreableDbItemSchema.safeParse(item);
  if (!parsed.success) return { isCorrect: null, pointsEarned: 0, error: "문항 데이터 형식이 올바르지 않습니다." };
  const { isCorrect, pointsEarned } = scoreItem(parsed.data, { answer: input.answer ?? null });
  return { isCorrect, pointsEarned };
}
