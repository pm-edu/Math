import { z } from "zod";
import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";

// 화면 검토(2026-08-27) [B]: /admin/toefl/attempts에서 "이탈 의심"(4시간+ in_progress) 건을
// 관리자가 직접 폐기(abandoned) 처리한다. 학생 본인은 /toefl/mypage에서 RLS "own attempts"의
// with-check(user_id = auth.uid())를 만족해 클라이언트에서 직접 update가 되지만, 관리자는
// 본인 행이 아니라서 같은 with-check를 통과 못 한다 — service client로 하는 서버 라우트가 필요.

const bodySchema = z.object({ attemptId: z.string().uuid() });

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  // 조회는 관리자 세션 클라이언트로 한다(위 grade-manual/regrade와 같은 원칙).
  const { data: attempt } = await auth.client
    .from("toefl_attempt")
    .select("id, status")
    .eq("id", parsed.data.attemptId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "응시 기록을 찾을 수 없습니다.");
  if (attempt.status !== "in_progress") return jsonError(409, "진행 중인 응시만 폐기할 수 있습니다.");

  const service = createToeflServiceClient();
  const { error } = await service.from("toefl_attempt").update({ status: "abandoned" }).eq("id", attempt.id);
  if (error) return jsonError(500, `폐기 처리에 실패했습니다: ${error.message}`);

  return Response.json({ ok: true });
}
