// 관리자가 pending_manual 응답을 수동 채점한 뒤, 그 응답이 속한 영역의 점수(raw/scaled/band)와
// 이미 제출 확정된 응시의 종합 점수(overall_band/total_scaled)를 다시 계산해 저장한다.
// finish 라우트(sections/[section]/finish/route.ts의 finishNonAdaptiveSection)와 submit 라우트가
// 쓰는 것과 완전히 같은 공식을 그대로 쓴다 — 다른 공식을 쓰면 자동채점 결과와 어긋난다.
//
// pending_manual은 write_an_email/academic_discussion(writing)·take_an_interview(speaking)에서만
// 생긴다(grade-response.ts) — 이 셋은 모두 블루프린트에 stage2가 없는 단일 stage1/base 섹션이라
// (writing/speaking엔 적응형 라우팅이 없음, §8) stage1/stage2 병합 로직이 필요 없다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCurrentModule, resolveModuleItemIds } from "./modules";
import { aggregateRaw, rawToScaled, scaledToBand } from "../scoring";
import type { ToeflSection } from "../types";

export type RecalcResult =
  | {
      ok: true;
      section: { rawScore: number; scaledScore: number; band: number };
      // 응시가 이미 제출 확정(status='scored')된 경우에만 채워진다.
      overall: { totalScaled: number; overallBand: number } | null;
    }
  | { ok: false; message: string };

export async function recalcSectionAndAttempt(
  service: SupabaseClient,
  attemptId: string,
  section: ToeflSection
): Promise<RecalcResult> {
  const { data: attempt } = await service
    .from("toefl_attempt")
    .select("id, form_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, message: "응시 기록을 찾을 수 없습니다." };

  const { data: form } = await service
    .from("toefl_form")
    .select("blueprint_version")
    .eq("id", attempt.form_id)
    .maybeSingle();
  if (!form) return { ok: false, message: "폼 정보를 찾을 수 없습니다." };

  const { data: sectionAttempt } = await service
    .from("toefl_section_attempt")
    .select("id")
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .maybeSingle();
  if (!sectionAttempt) return { ok: false, message: "영역 응시 기록을 찾을 수 없습니다." };

  const module = await resolveCurrentModule(service, attempt.form_id, section, null);
  if (!module) return { ok: false, message: "모듈을 찾을 수 없습니다." };

  const itemIds = await resolveModuleItemIds(service, attemptId, module.id, section, "stage1", "base", form.blueprint_version);
  const { data: items } = itemIds.length
    ? await service.from("toefl_item").select("id, points").in("id", itemIds)
    : { data: [] as { id: string; points: number }[] };
  const maxPoints = (items ?? []).reduce((sum, i) => sum + Number(i.points), 0);

  const { data: responses } = itemIds.length
    ? await service.from("toefl_response").select("points_earned").eq("attempt_id", attemptId).in("item_id", itemIds)
    : { data: [] as { points_earned: number | null }[] };

  const totalRaw = aggregateRaw(responses ?? []);
  const rawPercent = maxPoints > 0 ? (totalRaw / maxPoints) * 100 : 0;

  const { data: conversionRows } = await service
    .from("toefl_scale_conversion")
    .select("raw_min, raw_max, scaled, band")
    .eq("version", form.blueprint_version)
    .eq("section", section)
    .eq("route", "base");
  if (!conversionRows || conversionRows.length === 0) {
    return { ok: false, message: "영역점수 변환표를 찾을 수 없습니다." };
  }

  const scaled = rawToScaled(rawPercent, conversionRows);
  const band = scaledToBand(scaled, conversionRows);

  await service.from("toefl_section_attempt").update({ raw_score: totalRaw, scaled_score: scaled, band }).eq("id", sectionAttempt.id);

  // 이미 제출 확정된 응시라면 종합 점수도 submit 라우트와 같은 공식으로 다시 계산해 저장한다.
  let overall: { totalScaled: number; overallBand: number } | null = null;
  if (attempt.status === "scored") {
    const { data: allSections } = await service
      .from("toefl_section_attempt")
      .select("scaled_score, band")
      .eq("attempt_id", attemptId);
    const rows = allSections ?? [];
    const totalScaled = rows.reduce((sum, s) => sum + (s.scaled_score ?? 0), 0);
    const avgBand = rows.reduce((sum, s) => sum + Number(s.band ?? 0), 0) / (rows.length || 1);
    const overallBand = Math.round(avgBand * 2) / 2; // 0.5 단위 반올림 (§7, submit 라우트와 동일)
    await service.from("toefl_attempt").update({ overall_band: overallBand, total_scaled: totalScaled }).eq("id", attemptId);
    overall = { totalScaled, overallBand };
  }

  // 3차 화면 검토(2026-08-27) [C]-5: grading-queue 화면이 "확정 후 재계산된 값"을 바로
  // 보여줘야 해서, 저장만 하고 끝내지 않고 계산 결과를 그대로 돌려준다.
  return { ok: true, section: { rawScore: totalRaw, scaledScore: scaled, band }, overall };
}
