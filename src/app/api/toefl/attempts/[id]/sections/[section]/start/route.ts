import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { fetchBlueprint, resolveCurrentModule } from "@/lib/toefl/server/modules";
import { SECTION_ORDER } from "@/lib/toefl/section-order";
import type { ToeflSection } from "@/lib/toefl/types";

// 풀 모의고사(mode='full')에서 "다음 영역 시작". docs/toefl-spec.md §2(고정 순서 R→L→S→W), §9.
// POST /api/toefl/attempts는 새 toefl_attempt를 만드는 진입점이고, 이 라우트는 이미 있는
// attempt에 다음 section_attempt를 추가한다 — 같은 attempt 안에서 영역만 이어 붙이는 것.
// 순서를 건너뛸 수 없게, 이 섹션보다 앞선 모든 섹션이 이미 끝났는지(finished_at) 검증한다.

export async function POST(req: Request, { params }: { params: Promise<{ id: string; section: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId, section: sectionParam } = await params;
  const sectionIndex = SECTION_ORDER.indexOf(sectionParam as ToeflSection);
  if (sectionIndex === -1) return jsonError(400, "지원하지 않는 영역입니다.");
  const section = sectionParam as ToeflSection;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status, mode")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  if (attempt.status !== "in_progress") return jsonError(409, "이미 종료된 시험입니다.");
  if (attempt.mode !== "full") return jsonError(400, "풀 모의고사(mode='full') 응시에서만 사용할 수 있습니다.");

  const { data: existing } = await client
    .from("toefl_section_attempt")
    .select("id")
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .maybeSingle();
  if (existing) return jsonError(409, "이미 시작된 영역입니다.");

  const priorSections = SECTION_ORDER.slice(0, sectionIndex);
  if (priorSections.length > 0) {
    const { data: priorAttempts } = await client
      .from("toefl_section_attempt")
      .select("section, finished_at")
      .eq("attempt_id", attemptId)
      .in("section", priorSections);
    const finishedSet = new Set((priorAttempts ?? []).filter((s) => s.finished_at).map((s) => s.section));
    const missing = priorSections.filter((s) => !finishedSet.has(s));
    if (missing.length > 0) {
      return jsonError(400, `먼저 끝내야 하는 영역이 있습니다: ${missing.join(", ")}`);
    }
  }

  const { data: form } = await client
    .from("toefl_form")
    .select("blueprint_version")
    .eq("id", attempt.form_id)
    .maybeSingle();
  if (!form) return jsonError(500, "시험 폼 정보를 찾을 수 없습니다.");

  const blueprint = await fetchBlueprint(client, form.blueprint_version, section, "stage1", "base");
  if (!blueprint) return jsonError(500, "시험 구성(블루프린트)이 없습니다.");

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, attempt.form_id, section, null);
  if (!module) return jsonError(500, "모듈을 찾을 수 없습니다.");

  const now = Date.now();
  const deadlineAt = new Date(now + blueprint.time_limit_sec * 1000).toISOString();

  const { error: sectionErr } = await client.from("toefl_section_attempt").insert({
    attempt_id: attemptId,
    section,
    started_at: new Date(now).toISOString(),
    deadline_at: deadlineAt,
  });
  if (sectionErr) return jsonError(500, `영역 시작에 실패했습니다: ${sectionErr.message}`);

  return Response.json({ ok: true, section });
}
