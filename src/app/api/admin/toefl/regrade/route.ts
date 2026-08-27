import { z } from "zod";
import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { gradeSingleResponse } from "@/lib/toefl/server/grade-response";

// AI 채점이 재시도까지 실패해 status='pending_manual'로 남은 응답을 관리자가 수동으로 다시
// 돌린다. docs/toefl-spec.md §12 "실패 시 관리자 큐에 노출" — /admin/toefl/grading-queue 화면의
// "다시 시도" 버튼이 여기를 호출한다. 실제 채점 로직은 finish 라우트와 완전히 같은 함수
// (grade-response.ts)를 쓴다 — 여기서만 force:true로 이미 채점됐어도 강제로 다시 돈다.

const bodySchema = z.object({ responseId: z.string().uuid() });

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");
  const { responseId } = parsed.data;

  const service = createToeflServiceClient();

  const { data: response } = await service
    .from("toefl_response")
    .select("id, item_id, answer, audio_path, transcript")
    .eq("id", responseId)
    .maybeSingle();
  if (!response) return jsonError(404, "응답을 찾을 수 없습니다.");

  const { data: item } = await service
    .from("toefl_item")
    .select("id, task_type, prompt, payload, points")
    .eq("id", response.item_id)
    .maybeSingle();
  if (!item) return jsonError(404, "문항을 찾을 수 없습니다.");

  const result = await gradeSingleResponse(service, item, response, { force: true });

  return Response.json({ ok: true, warning: result.warning ?? null });
}
