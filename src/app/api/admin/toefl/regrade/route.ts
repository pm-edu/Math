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

  // 조회는 관리자 세션 클라이언트(RLS 적용)로 한다(2026-08-27 재검증 B1) — service client를
  // 처음부터 끝까지 쓰면 RLS를 완전히 우회해서, 이 라우트의 권한 판정(requireToeflStaff)이
  // 유일한 방어선이 된다. toefl_response/toefl_item 둘 다 "staff는 전체 조회 가능" RLS 정책이
  // 이미 있으므로(202608151201), 관리자 세션 클라이언트로 읽어도 정상 동작하고, RLS가 두 번째
  // 방어선 역할을 한다 — 응답이 실제로 존재하고 이 직원이 볼 권한이 있는지를 RLS 스스로 확인한다.
  const { data: response } = await auth.client
    .from("toefl_response")
    .select("id, item_id, answer, audio_path, transcript")
    .eq("id", responseId)
    .maybeSingle();
  if (!response) return jsonError(404, "응답을 찾을 수 없습니다.");

  const { data: item } = await auth.client
    .from("toefl_item")
    .select("id, task_type, prompt, payload, points")
    .eq("id", response.item_id)
    .maybeSingle();
  if (!item) return jsonError(404, "문항을 찾을 수 없습니다.");

  // 실제 채점 저장은 service client가 필요하다 — toefl_response RLS의 with-check가 "본인 행만"
  // 허용해서(202608151201 "own responses" 정책), 관리자 세션으로는 남의 응답에 points_earned를
  // 쓸 수 없다. 녹음 다운로드도 storage RLS가 경로 첫 세그먼트=user_id라 마찬가지로 막힌다.
  // 위에서 RLS로 이미 존재·조회권한을 확인한 response/item만 그대로 넘기므로, service client는
  // 여기서부터 "쓰기 전용 도구"로만 쓰인다(새로 조회하지 않는다).
  const service = createToeflServiceClient();
  const result = await gradeSingleResponse(service, item, response, { force: true });

  return Response.json({ ok: true, warning: result.warning ?? null });
}
