import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { fetchBlueprint, resolveCurrentModule } from "@/lib/toefl/server/modules";
import { ADAPTIVE_SECTIONS } from "@/lib/toefl/section-order";
import { gradeWritingResponse } from "@/lib/toefl/server/ai-grading";
import { gradeInterviewAudio, scoreListenAndRepeatFromTranscript, transcribeAudio } from "@/lib/toefl/server/audio-grading";
import { aggregateRaw, aiRubricToPoints, applyRouteCap, rawToScaled, routeStage2, scaledToBand } from "@/lib/toefl/scoring";
import type {
  AcademicDiscussionPayload,
  ListenAndRepeatPayload,
  TakeAnInterviewPayload,
  ToeflSection,
  WriteAnEmailPayload,
} from "@/lib/toefl/types";

// writing/speaking 종료 시 ai_rubric·auto_transcript 문항을 순차로 Gemini 채점(각각 최대 2회
// 파싱 재시도 × callGemini 내부 3회 네트워크 재시도)하면 기본 서버리스 함수 실행시간 제한을
// 넘을 수 있어 늘려둔다. Speaking은 오디오 다운로드까지 더해져 writing보다 더 걸릴 수 있다.
export const maxDuration = 150;

// reading·listening만 Stage1→Stage2 적응형 구조다(§8: "Reading/Listening에만 적용").
// writing/speaking은 블루프린트에 stage2 행이 아예 없어서(단일 stage1/base) 이 라우팅
// 로직이 안 맞는다 — 아래에서 완전히 다른 분기(단일 종료)로 처리한다. (ADAPTIVE_SECTIONS는
// insights 라우트도 같은 분기가 필요해져서 section-order.ts로 옮김, 2026-08-18)
const SUPPORTED_SECTIONS: ToeflSection[] = ["reading", "listening", "writing", "speaking"];

// 영역 종료 → 라우팅 or 다음 영역. docs/toefl-spec.md §8, §9, §11.
// 두 단계 중 하나로 동작한다 (routed_to로 판정):
//   1) stage1 종료: stage1 원점수 집계 → routeStage2 → stage2 모듈로 라우팅, 타이머 갱신.
//      route 값(easy/hard)은 응답에 절대 포함하지 않는다(§8 5번 규칙).
//   2) stage2 종료(= 영역 종료): 전체(stage1+stage2) 원점수 집계 → 영역점수·밴드 산출·저장.
// finished_at이 이미 있으면(이중 클릭 등) 재계산하지 않고 기존 결과를 그대로 반환한다(idempotent).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; section: string }> }
) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId, section: sectionParam } = await params;
  if (!SUPPORTED_SECTIONS.includes(sectionParam as ToeflSection)) {
    return jsonError(400, "Reading/Listening/Writing/Speaking 영역만 아직 지원합니다.");
  }
  const section = sectionParam as ToeflSection;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  if (attempt.status !== "in_progress") return jsonError(409, "이미 종료된 시험입니다.");

  const { data: sectionAttempt } = await client
    .from("toefl_section_attempt")
    .select("id, deadline_at, finished_at, routed_to, raw_score, scaled_score, band")
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .maybeSingle();
  if (!sectionAttempt) return jsonError(404, "해당 영역 응시 기록을 찾을 수 없습니다.");

  if (sectionAttempt.finished_at) {
    return Response.json({
      ok: true,
      done: true,
      alreadyFinished: true,
      raw_score: sectionAttempt.raw_score,
      scaled_score: sectionAttempt.scaled_score,
      band: sectionAttempt.band,
    });
  }

  const { data: form } = await client
    .from("toefl_form")
    .select("blueprint_version")
    .eq("id", attempt.form_id)
    .maybeSingle();
  if (!form) return jsonError(500, "시험 폼 정보를 찾을 수 없습니다.");

  const service = createToeflServiceClient();

  if (!ADAPTIVE_SECTIONS.includes(section)) {
    return finishNonAdaptiveSection({ client, service, attempt, section, sectionAttempt, blueprintVersion: form.blueprint_version });
  }

  if (!sectionAttempt.routed_to) {
    // ── stage1 종료: 라우팅 ──
    const stage1Module = await resolveCurrentModule(service, attempt.form_id, section, null);
    if (!stage1Module) return jsonError(500, "Stage1 모듈을 찾을 수 없습니다.");

    const { data: stage1Items } = await service.from("toefl_item").select("id").eq("module_id", stage1Module.id);
    const stage1ItemIds = (stage1Items ?? []).map((i) => i.id);

    const { data: stage1Responses } = stage1ItemIds.length
      ? await client
          .from("toefl_response")
          .select("points_earned")
          .eq("attempt_id", attemptId)
          .in("item_id", stage1ItemIds)
      : { data: [] as { points_earned: number | null }[] };

    const stage1Raw = aggregateRaw(stage1Responses ?? []);

    const blueprint = await fetchBlueprint(client, form.blueprint_version, section, "stage1", "base");
    const threshold = Number(blueprint?.task_mix?.routing_threshold ?? 0);
    const route = routeStage2(stage1Raw, threshold);

    const stage2Module = await resolveCurrentModule(service, attempt.form_id, section, route);
    if (!stage2Module) return jsonError(500, "Stage2 모듈을 찾을 수 없습니다.");
    const stage2Blueprint = await fetchBlueprint(client, form.blueprint_version, section, "stage2", route);
    if (!stage2Blueprint) return jsonError(500, "Stage2 블루프린트를 찾을 수 없습니다.");

    const deadlineAt = new Date(Date.now() + stage2Blueprint.time_limit_sec * 1000).toISOString();

    const { error: updateErr } = await client
      .from("toefl_section_attempt")
      .update({ stage1_raw: stage1Raw, routed_to: route, deadline_at: deadlineAt })
      .eq("id", sectionAttempt.id);
    if (updateErr) return jsonError(500, `라우팅 저장에 실패했습니다: ${updateErr.message}`);

    return Response.json({ ok: true, done: false });
  }

  // ── stage2 종료: 영역 최종 점수 산출 ──
  const routedTo = sectionAttempt.routed_to;
  const stage1Module = await resolveCurrentModule(service, attempt.form_id, section, null);
  const stage2Module = await resolveCurrentModule(service, attempt.form_id, section, routedTo);
  if (!stage1Module || !stage2Module) return jsonError(500, "모듈을 찾을 수 없습니다.");

  const { data: allItems } = await service
    .from("toefl_item")
    .select("id, points")
    .in("module_id", [stage1Module.id, stage2Module.id]);
  const allItemIds = (allItems ?? []).map((i) => i.id);
  const maxPoints = (allItems ?? []).reduce((sum, i) => sum + Number(i.points), 0);

  const { data: allResponses } = allItemIds.length
    ? await client
        .from("toefl_response")
        .select("points_earned")
        .eq("attempt_id", attemptId)
        .in("item_id", allItemIds)
    : { data: [] as { points_earned: number | null }[] };

  const totalRaw = aggregateRaw(allResponses ?? []);
  const rawPercent = maxPoints > 0 ? (totalRaw / maxPoints) * 100 : 0;

  const { data: conversionRows } = await client
    .from("toefl_scale_conversion")
    .select("raw_min, raw_max, scaled")
    .eq("version", form.blueprint_version)
    .eq("section", section)
    .eq("route", routedTo);
  if (!conversionRows || conversionRows.length === 0) {
    return jsonError(500, "영역점수 변환표를 찾을 수 없습니다.");
  }

  const scaled = rawToScaled(rawPercent, conversionRows);
  const band = applyRouteCap(scaledToBand(scaled), routedTo);

  const { error: finishErr } = await client
    .from("toefl_section_attempt")
    .update({
      raw_score: totalRaw,
      scaled_score: scaled,
      band,
      finished_at: new Date().toISOString(),
    })
    .eq("id", sectionAttempt.id);
  if (finishErr) return jsonError(500, `채점 저장에 실패했습니다: ${finishErr.message}`);

  return Response.json({ ok: true, done: true, raw_score: totalRaw, scaled_score: scaled, band });
}

// ── writing(그리고 나중에 speaking) 같은 비적응형 단일 모듈 섹션 ──
// stage1→stage2 라우팅이 없어 한 번의 finish 호출로 바로 끝난다. ai_rubric 문항(write_an_email/
// academic_discussion)은 여기서 AI 채점을 실행한 뒤 그 결과(overall_band)를 aiRubricToPoints로
// points_earned로 바꿔서, 자동채점 문항과 동일한 aggregateRaw→rawToScaled→scaledToBand
// 파이프라인에 그대로 태운다. AI 채점이 실패해도(§12 "채점 실패가 리포트 전체를 막지 않는다")
// warnings에만 담고 나머지 처리는 계속한다 — 실패한 문항은 0점으로 남는다.
async function finishNonAdaptiveSection(params: {
  client: SupabaseClient;
  service: SupabaseClient;
  attempt: { id: string; form_id: string };
  section: ToeflSection;
  sectionAttempt: { id: string };
  blueprintVersion: string;
}) {
  const { client, service, attempt, section, sectionAttempt, blueprintVersion } = params;

  const module = await resolveCurrentModule(service, attempt.form_id, section, null);
  if (!module) return jsonError(500, "모듈을 찾을 수 없습니다.");

  const { data: items } = await service
    .from("toefl_item")
    .select("id, task_type, scoring_mode, points, prompt, payload")
    .eq("module_id", module.id);
  const itemList = items ?? [];
  const itemIds = itemList.map((i) => i.id);

  const { data: responses } = itemIds.length
    ? await client
        .from("toefl_response")
        .select("id, item_id, answer, audio_path, transcript")
        .eq("attempt_id", attempt.id)
        .in("item_id", itemIds)
    : { data: [] as { id: string; item_id: string; answer: unknown; audio_path: string | null; transcript: string | null }[] };
  const responseByItem = new Map((responses ?? []).map((r) => [r.item_id, r]));

  const warnings: string[] = [];

  for (const item of itemList) {
    const response = responseByItem.get(item.id);
    if (!response) continue; // 미응답 — 0점 그대로 둔다

    if (item.task_type === "write_an_email" || item.task_type === "academic_discussion") {
      const already = await hasAiScore(service, response.id);
      if (already) continue;

      const answerText = ((response.answer as { text?: string } | null)?.text ?? "").trim();
      if (!answerText) continue;

      const result = await gradeWritingResponse({
        taskType: item.task_type,
        prompt: item.prompt,
        payload: item.payload as WriteAnEmailPayload | AcademicDiscussionPayload,
        responseText: answerText,
      });

      if (!result.ok) {
        warnings.push(`${item.task_type} 채점 실패: ${result.message}`);
        continue;
      }

      const points = aiRubricToPoints(result.rubric.overall_band, Number(item.points));
      await saveAiScore(service, response.id, result.rubric, result.rubric.overall_band, result.rubric.feedback_ko);
      await service.from("toefl_response").update({ points_earned: points }).eq("id", response.id);
      continue;
    }

    if (item.task_type === "take_an_interview") {
      const already = await hasAiScore(service, response.id);
      if (already || !response.audio_path) continue;

      const audioBase64 = await downloadAudioBase64(service, response.audio_path);
      if (!audioBase64) {
        warnings.push("take_an_interview 채점 실패: 녹음 파일을 읽지 못했습니다.");
        continue;
      }

      const payload = item.payload as TakeAnInterviewPayload;
      const result = await gradeInterviewAudio({
        audioBase64,
        mimeType: guessAudioMimeType(response.audio_path),
        question: item.prompt,
        turnType: payload.turn_type,
      });
      if (!result.ok) {
        warnings.push(`take_an_interview 채점 실패: ${result.message}`);
        continue;
      }

      const points = aiRubricToPoints(result.rubric.overall_band, Number(item.points));
      await saveAiScore(service, response.id, result.rubric, result.rubric.overall_band, result.rubric.feedback_ko);
      await service.from("toefl_response").update({ points_earned: points }).eq("id", response.id);
      continue;
    }

    if (item.task_type === "listen_and_repeat") {
      if (response.transcript || !response.audio_path) continue; // 이미 STT 완료(idempotent)

      const audioBase64 = await downloadAudioBase64(service, response.audio_path);
      if (!audioBase64) {
        warnings.push("listen_and_repeat 채점 실패: 녹음 파일을 읽지 못했습니다.");
        continue;
      }

      const sttResult = await transcribeAudio(audioBase64, guessAudioMimeType(response.audio_path));
      if (!sttResult.ok) {
        warnings.push(`listen_and_repeat 채점 실패: ${sttResult.message}`);
        continue;
      }

      const payload = item.payload as ListenAndRepeatPayload;
      const { isCorrect, pointsEarned } = scoreListenAndRepeatFromTranscript(
        payload.target_sentence,
        Number(item.points),
        sttResult.transcript
      );
      await service
        .from("toefl_response")
        .update({ transcript: sttResult.transcript, is_correct: isCorrect, points_earned: pointsEarned })
        .eq("id", response.id);
    }
  }

  const { data: finalResponses } = itemIds.length
    ? await client.from("toefl_response").select("points_earned").eq("attempt_id", attempt.id).in("item_id", itemIds)
    : { data: [] as { points_earned: number | null }[] };

  const totalRaw = aggregateRaw(finalResponses ?? []);
  const maxPoints = itemList.reduce((sum, i) => sum + Number(i.points), 0);
  const rawPercent = maxPoints > 0 ? (totalRaw / maxPoints) * 100 : 0;

  const { data: conversionRows } = await client
    .from("toefl_scale_conversion")
    .select("raw_min, raw_max, scaled")
    .eq("version", blueprintVersion)
    .eq("section", section)
    .eq("route", "base");
  if (!conversionRows || conversionRows.length === 0) {
    return jsonError(500, "영역점수 변환표를 찾을 수 없습니다.");
  }

  const scaled = rawToScaled(rawPercent, conversionRows);
  const band = scaledToBand(scaled);

  const { error: finishErr } = await client
    .from("toefl_section_attempt")
    .update({ raw_score: totalRaw, scaled_score: scaled, band, finished_at: new Date().toISOString() })
    .eq("id", sectionAttempt.id);
  if (finishErr) return jsonError(500, `채점 저장에 실패했습니다: ${finishErr.message}`);

  return Response.json({ ok: true, done: true, raw_score: totalRaw, scaled_score: scaled, band, warnings });
}

async function hasAiScore(service: SupabaseClient, responseId: string): Promise<boolean> {
  const { data } = await service.from("toefl_ai_score").select("id").eq("response_id", responseId).maybeSingle();
  return !!data;
}

async function saveAiScore(
  service: SupabaseClient,
  responseId: string,
  rubric: Record<string, unknown>,
  overall: number,
  feedbackKo: string
) {
  await service.from("toefl_ai_score").insert({
    response_id: responseId,
    model: "gemini-flash-latest",
    rubric,
    overall,
    feedback_ko: feedbackKo,
    raw_output: rubric,
  });
}

// 클라이언트는 실제 녹음 포맷(webm 또는 Safari mp4 폴백)을 파일 확장자로 남겨둔다
// (RecorderPanel.tsx) — 여기서 하드코딩된 "audio/webm" 대신 그 확장자로 Gemini에 보낼
// mimeType을 고른다. 안 맞으면 Gemini가 오디오를 못 읽어서 mp4 폴백이 조용히 깨진다.
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
