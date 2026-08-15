import { z } from "zod";
import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { resolveCurrentModule } from "@/lib/toefl/server/modules";
import { scoreItem, type ScoreableItem } from "@/lib/toefl/scoring";

// 답안 저장(배치, idempotent upsert). docs/toefl-spec.md §9, §11 2번(자동저장) 규칙.
// 채점을 위해 answer_key가 필요하지만 학생 세션으로는 절대 조회할 수 없으므로(§5) service
// client로만 잠깐 읽어 서버 메모리에서 계산하고, 응답(JSON)에는 isCorrect/pointsEarned를
// 포함하지 않는다 — 결과는 finish/submit 이후에만 알려준다(응시 중 정답 노출 금지).

const bodySchema = z.object({
  responses: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        answer: z.unknown(),
        time_spent_ms: z.number().int().nonnegative().optional(),
      })
    )
    .min(1)
    .max(50),
});

const DEADLINE_GRACE_MS = 5000; // §11 1번: now() > deadline_at + 5s면 거부

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");
  const { responses } = parsed.data;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  if (attempt.status !== "in_progress") return jsonError(409, "이미 종료된 시험입니다.");

  const { data: sectionAttempt } = await client
    .from("toefl_section_attempt")
    .select("deadline_at, finished_at, routed_to")
    .eq("attempt_id", attemptId)
    .eq("section", "reading")
    .maybeSingle();
  if (!sectionAttempt) return jsonError(404, "Reading 영역 응시 기록을 찾을 수 없습니다.");
  if (sectionAttempt.finished_at) return jsonError(409, "이미 제출된 영역입니다.");

  if (sectionAttempt.deadline_at) {
    const deadline = new Date(sectionAttempt.deadline_at).getTime();
    if (Date.now() > deadline + DEADLINE_GRACE_MS) {
      return jsonError(409, "제출 시간이 종료되었습니다.");
    }
  }

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, attempt.form_id, "reading", sectionAttempt.routed_to);
  if (!module) return jsonError(500, "현재 모듈을 찾을 수 없습니다.");

  const requestedIds = responses.map((r) => r.item_id);
  const { data: items, error: itemsErr } = await service
    .from("toefl_item")
    .select("id, task_type, scoring_mode, points, answer_key")
    .eq("module_id", module.id)
    .in("id", requestedIds);
  if (itemsErr) return jsonError(500, `문항 조회에 실패했습니다: ${itemsErr.message}`);

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  if (itemById.size !== requestedIds.length) {
    return jsonError(400, "현재 모듈에 속하지 않는 문항이 포함되어 있습니다.");
  }

  const now = new Date().toISOString();
  const rows = responses.map((r) => {
    const item = itemById.get(r.item_id) as ScoreableItem & { id: string };
    const { isCorrect, pointsEarned } = scoreItem(item, { answer: r.answer as never });
    return {
      attempt_id: attemptId,
      item_id: r.item_id,
      answer: r.answer,
      time_spent_ms: r.time_spent_ms ?? null,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      answered_at: now,
    };
  });

  const { error: upsertErr } = await client
    .from("toefl_response")
    .upsert(rows, { onConflict: "attempt_id,item_id" });
  if (upsertErr) return jsonError(500, `답안 저장에 실패했습니다: ${upsertErr.message}`);

  return Response.json({ ok: true, saved: rows.length });
}
