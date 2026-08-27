// 응답 1개를 AI로 채점하는 공용 로직. docs/toefl-spec.md §12.
//
// 원래 finish/route.ts 안에 있던 for문 본문을 그대로 뽑아온 것 — attempt 종료 시 자동으로
// 도는 경로와, 관리자가 실패한 채점을 재시도하는 경로(api/admin/toefl/regrade)가 같은 로직을
// 써야 idempotent 판정(hasAiScore)과 pending_manual 저장 규칙이 어긋나지 않는다.
//
// 실패(재시도까지 다 실패)하면 조용히 0점으로 남기지 않고 toefl_ai_score에 status='pending_manual'
// 행을 남긴다(spec §12, 2026-08-27 교차검증 A5 — 이 컬럼 자체가 없어서 미구현이었던 부분).

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeWritingResponse } from "./ai-grading";
import { gradeInterviewAudio, scoreListenAndRepeatFromTranscript, transcribeAudio } from "./audio-grading";
import { aiRubricToPoints } from "../scoring";
import {
  academicDiscussionPayloadSchema,
  listenAndRepeatPayloadSchema,
  takeAnInterviewPayloadSchema,
  writeAnEmailPayloadSchema,
} from "../zod-schemas";

// item.payload/response.answer는 DB jsonb라 실제로는 unknown이다 — 예전엔 as로 우겼는데
// (2026-08-27 교차검증 C2), 여기서 저장 시점 계약(§6)과 실제로 맞는지 zod로 확인한다.
// 이 값들은 우리 자신의 생성기(server/generators/*)가 저장한 서버 신뢰 데이터라 안 맞으면
// 진짜 버그(스펙 계약 위반) — 조용히 넘어가지 않고 pending_manual로 남겨 관리자에게 알린다.
const essayAnswerTextSchema = z.object({ text: z.string() }).partial();

export type GradableItem = {
  id: string;
  task_type: string;
  prompt: string;
  payload: unknown;
  points: number;
};

export type GradableResponse = {
  id: string;
  answer: unknown;
  audio_path: string | null;
  transcript: string | null;
};

export type GradeSingleResult = { warning?: string };

/**
 * 응답 하나를 채점한다. `force`가 true면 이미 채점(status='graded')됐어도 다시 돈다(관리자
 * 재시도용) — 기본값(false)은 finish 라우트의 idempotent 동작 그대로(이미 채점됐으면 건너뜀).
 */
export async function gradeSingleResponse(
  service: SupabaseClient,
  item: GradableItem,
  response: GradableResponse,
  options: { force?: boolean } = {}
): Promise<GradeSingleResult> {
  if (item.task_type === "write_an_email" || item.task_type === "academic_discussion") {
    if (!options.force && (await hasGradedScore(service, response.id))) return {};

    const answerParsed = essayAnswerTextSchema.safeParse(response.answer);
    const answerText = (answerParsed.success ? answerParsed.data.text : "")?.trim() ?? "";
    if (!answerText) return {}; // 미응답 — 0점 그대로, AI 호출 자체를 안 한다

    const payloadSchema = item.task_type === "write_an_email" ? writeAnEmailPayloadSchema : academicDiscussionPayloadSchema;
    const payloadParsed = payloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) {
      const message = `문항 payload가 §6 계약과 안 맞습니다: ${payloadParsed.error.issues[0]?.message ?? "형식 오류"}`;
      await savePendingManualScore(service, response.id, message);
      return { warning: `${item.task_type} 채점 실패: ${message}` };
    }

    const result = await gradeWritingResponse({
      taskType: item.task_type,
      prompt: item.prompt,
      payload: payloadParsed.data,
      responseText: answerText,
    });

    if (!result.ok) {
      await savePendingManualScore(service, response.id, result.message);
      return { warning: `${item.task_type} 채점 실패: ${result.message}` };
    }

    const points = aiRubricToPoints(result.rubric.overall_band, Number(item.points));
    await saveAiScore(service, response.id, result.rubric, result.rubric.overall_band, result.rubric.feedback_ko);
    await service.from("toefl_response").update({ points_earned: points }).eq("id", response.id);
    return {};
  }

  if (item.task_type === "take_an_interview") {
    if (!response.audio_path) return {};
    if (!options.force && (await hasGradedScore(service, response.id))) return {};

    const audioBase64 = await downloadAudioBase64(service, response.audio_path);
    if (!audioBase64) {
      const message = "녹음 파일을 읽지 못했습니다.";
      await savePendingManualScore(service, response.id, message);
      return { warning: `take_an_interview 채점 실패: ${message}` };
    }

    const payloadParsed = takeAnInterviewPayloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) {
      const message = `문항 payload가 §6 계약과 안 맞습니다: ${payloadParsed.error.issues[0]?.message ?? "형식 오류"}`;
      await savePendingManualScore(service, response.id, message);
      return { warning: `take_an_interview 채점 실패: ${message}` };
    }
    const result = await gradeInterviewAudio({
      audioBase64,
      mimeType: guessAudioMimeType(response.audio_path),
      question: item.prompt,
      turnType: payloadParsed.data.turn_type,
    });
    if (!result.ok) {
      await savePendingManualScore(service, response.id, result.message);
      return { warning: `take_an_interview 채점 실패: ${result.message}` };
    }

    const points = aiRubricToPoints(result.rubric.overall_band, Number(item.points));
    await saveAiScore(service, response.id, result.rubric, result.rubric.overall_band, result.rubric.feedback_ko);
    await service.from("toefl_response").update({ points_earned: points }).eq("id", response.id);
    return {};
  }

  if (item.task_type === "listen_and_repeat") {
    // STT는 ai_score가 아니라 response.transcript로 idempotent 판정한다(루브릭이 아니라 전사라서).
    if (!options.force && (response.transcript || !response.audio_path)) return {};
    if (!response.audio_path) return {};

    const audioBase64 = await downloadAudioBase64(service, response.audio_path);
    if (!audioBase64) return { warning: "listen_and_repeat 채점 실패: 녹음 파일을 읽지 못했습니다." };

    const sttResult = await transcribeAudio(audioBase64, guessAudioMimeType(response.audio_path));
    if (!sttResult.ok) return { warning: `listen_and_repeat 채점 실패: ${sttResult.message}` };

    const payloadParsed = listenAndRepeatPayloadSchema.safeParse(item.payload);
    if (!payloadParsed.success) {
      return { warning: `listen_and_repeat 채점 실패: 문항 payload가 §6 계약과 안 맞습니다.` };
    }
    const { isCorrect, pointsEarned } = scoreListenAndRepeatFromTranscript(
      payloadParsed.data.target_sentence,
      Number(item.points),
      sttResult.transcript
    );
    await service
      .from("toefl_response")
      .update({ transcript: sttResult.transcript, is_correct: isCorrect, points_earned: pointsEarned })
      .eq("id", response.id);
    return {};
  }

  return {};
}

async function hasGradedScore(service: SupabaseClient, responseId: string): Promise<boolean> {
  const { data } = await service
    .from("toefl_ai_score")
    .select("id")
    .eq("response_id", responseId)
    .eq("status", "graded")
    .maybeSingle();
  return !!data;
}

async function saveAiScore(
  service: SupabaseClient,
  responseId: string,
  rubric: Record<string, unknown>,
  overall: number,
  feedbackKo: string
) {
  // pending_manual로 남아있던 이전 시도가 있으면 지운다 — 같은 응답에 pending_manual과 graded가
  // 동시에 쌓이면 관리자 큐(status='pending_manual' 목록)에 이미 해결된 항목이 계속 남는다.
  await service.from("toefl_ai_score").delete().eq("response_id", responseId).eq("status", "pending_manual");
  await service.from("toefl_ai_score").insert({
    response_id: responseId,
    model: "gemini-flash-latest",
    rubric,
    overall,
    feedback_ko: feedbackKo,
    raw_output: rubric,
    status: "graded",
  });
}

async function savePendingManualScore(service: SupabaseClient, responseId: string, reason: string) {
  // 재시도(관리자 큐의 "다시 시도" 버튼)마다 새로 쌓이지 않게, 이전 pending_manual 행을 지우고 새로 남긴다.
  await service.from("toefl_ai_score").delete().eq("response_id", responseId).eq("status", "pending_manual");
  await service.from("toefl_ai_score").insert({
    response_id: responseId,
    model: "gemini-flash-latest",
    rubric: {},
    overall: 0,
    feedback_ko: `자동 채점에 실패했습니다: ${reason}`,
    status: "pending_manual",
  });
}

// 클라이언트는 실제 녹음 포맷(webm 또는 Safari mp4 폴백)을 파일 확장자로 남겨둔다
// (RecorderPanel.tsx) — 하드코딩된 "audio/webm" 대신 그 확장자로 Gemini에 보낼 mimeType을 고른다.
function guessAudioMimeType(path: string): string {
  return path.toLowerCase().endsWith(".mp4") ? "audio/mp4" : "audio/webm";
}

// toefl-recordings는 비공개 버킷이라 service role로만 내려받을 수 있다(§5와 같은 원칙).
async function downloadAudioBase64(service: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await service.storage.from("toefl-recordings").download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}
