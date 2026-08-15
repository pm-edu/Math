import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { resolveCurrentModule } from "@/lib/toefl/server/modules";

// 현재 모듈 문항 + 잔여시간 + 기존 답안. docs/toefl-spec.md §9, §11.
// 새로고침 복구는 전적으로 이 엔드포인트에 의존한다(로컬스토리지에 의존하지 않음, §11 3번 규칙) —
// 시험 시작 직후 첫 화면도 이 엔드포인트를 그대로 호출해서 그린다(두 갈래 로직을 만들지 않기 위해).
// answer_key/explanation_*/transcript는 이 응답에 절대 담지 않는다(§5).

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");

  const { data: sectionAttempt } = await client
    .from("toefl_section_attempt")
    .select("id, section, deadline_at, finished_at, routed_to, raw_score, scaled_score, band")
    .eq("attempt_id", attemptId)
    .eq("section", "reading")
    .maybeSingle();
  if (!sectionAttempt) return jsonError(404, "Reading 영역 응시 기록을 찾을 수 없습니다.");

  if (sectionAttempt.finished_at) {
    return Response.json({
      ok: true,
      attempt: { id: attempt.id, status: attempt.status },
      section: {
        section: "reading",
        finished: true,
        deadline_at: null,
        raw_score: sectionAttempt.raw_score,
        scaled_score: sectionAttempt.scaled_score,
        band: sectionAttempt.band,
      },
      module: null,
      items: [],
      stimuli: [],
      answers: {},
    });
  }

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, attempt.form_id, "reading", sectionAttempt.routed_to);
  if (!module) return jsonError(500, "현재 모듈을 찾을 수 없습니다.");

  const [{ data: items }, { data: stimuli }] = await Promise.all([
    client.from("toefl_item_public").select("*").eq("module_id", module.id).order("position"),
    client.from("toefl_stimulus_public").select("*").eq("module_id", module.id).order("position"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: responses } = itemIds.length
    ? await client
        .from("toefl_response")
        .select("item_id, answer, time_spent_ms")
        .eq("attempt_id", attemptId)
        .in("item_id", itemIds)
    : { data: [] as { item_id: string; answer: unknown; time_spent_ms: number | null }[] };

  const answers: Record<string, { answer: unknown; time_spent_ms: number | null }> = {};
  for (const r of responses ?? []) {
    answers[r.item_id] = { answer: r.answer, time_spent_ms: r.time_spent_ms };
  }

  return Response.json({
    ok: true,
    attempt: { id: attempt.id, status: attempt.status },
    section: {
      section: "reading",
      finished: false,
      deadline_at: sectionAttempt.deadline_at,
    },
    // stage/route는 절대 클라이언트에 노출하지 않는다(§8) — module.id/position만 넘긴다.
    module: { id: module.id, position: module.position },
    items: items ?? [],
    stimuli: stimuli ?? [],
    answers,
  });
}
