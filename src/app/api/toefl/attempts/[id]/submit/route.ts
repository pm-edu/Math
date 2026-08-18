import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { SECTION_ORDER } from "@/lib/toefl/section-order";

// 전체 제출 → 결과 확정. docs/toefl-spec.md §9, §11(마지막 상태 'submitted').
// P1 범위(reading section_practice)에서는 finish가 이미 채점을 끝내놓으므로, 여기서는
// 모든 영역이 끝났는지 확인하고 attempt 상태만 확정한다. 이미 제출된 경우 idempotent하게
// 같은 결과를 다시 돌려준다(이중 클릭 대비).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, mode, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");

  const { data: sections } = await client
    .from("toefl_section_attempt")
    .select("section, finished_at, raw_score, scaled_score, band")
    .eq("attempt_id", attemptId);

  if (!sections || sections.length === 0) return jsonError(400, "응시한 영역이 없습니다.");

  const unfinished = sections.filter((s) => !s.finished_at);
  if (unfinished.length > 0) {
    return jsonError(400, "아직 완료되지 않은 영역이 있습니다.");
  }

  // full 모드는 4영역 전부의 section_attempt가 있어야 한다 — 위 unfinished 체크는 "존재하는
  // 행이 다 끝났는지"만 보므로, 아직 시작조차 안 한 영역(행 자체가 없음)은 걸러내지 못한다.
  // UI는 SectionDoneActions가 순서대로 이어붙이게 막아두지만, API를 직접 호출하면 일부
  // 영역만으로 제출을 확정할 수 있었던 취약점(코드리뷰 지적) — 여기서 서버가 다시 검증한다.
  if (attempt.mode === "full") {
    const present = new Set(sections.map((s) => s.section));
    const missing = SECTION_ORDER.filter((s) => !present.has(s));
    if (missing.length > 0) {
      return jsonError(400, `아직 시작하지 않은 영역이 있습니다: ${missing.join(", ")}`);
    }
  }

  if (attempt.status === "in_progress") {
    const { error: updateErr } = await client
      .from("toefl_attempt")
      .update({ status: "scored", submitted_at: new Date().toISOString(), scored_at: new Date().toISOString() })
      .eq("id", attemptId);
    if (updateErr) return jsonError(500, `제출 처리에 실패했습니다: ${updateErr.message}`);
  }

  const totalScaled = sections.reduce((sum, s) => sum + (s.scaled_score ?? 0), 0);
  const avgBand = sections.reduce((sum, s) => sum + Number(s.band ?? 0), 0) / sections.length;
  const overallBand = Math.round(avgBand * 2) / 2; // 0.5 단위 반올림 (§7)

  return Response.json({
    ok: true,
    sections: sections.map((s) => ({
      section: s.section,
      raw_score: s.raw_score,
      scaled_score: s.scaled_score,
      band: s.band,
    })),
    overall: { total_scaled: totalScaled, band: overallBand },
  });
}
