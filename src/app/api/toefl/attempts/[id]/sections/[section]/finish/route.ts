import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { fetchBlueprint, resolveCurrentModule } from "@/lib/toefl/server/modules";
import { aggregateRaw, applyRouteCap, rawToScaled, routeStage2, scaledToBand } from "@/lib/toefl/scoring";
import type { ToeflSection } from "@/lib/toefl/types";

// reading·listening만 Stage1→Stage2 적응형 구조다(§8: "Reading/Listening에만 적용").
// speaking/writing은 블루프린트에 stage2 행이 아예 없어서(단일 stage1/base) 이 라우팅 로직이 안 맞는다.
const ADAPTIVE_SECTIONS: ToeflSection[] = ["reading", "listening"];

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
  if (!ADAPTIVE_SECTIONS.includes(sectionParam as ToeflSection)) {
    return jsonError(400, "Reading/Listening 영역만 아직 지원합니다.");
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
