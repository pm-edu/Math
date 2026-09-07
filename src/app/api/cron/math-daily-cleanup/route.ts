import { createClient } from "@supabase/supabase-js";
import { jsonError, requireCronSecret } from "@/lib/math/server/auth";

// 수학 학습 진행 구조 PG5 5-2: 매일 math_daily_activity 정리.
//
// "스트릭 끊김 처리"는 별도 배치가 필요 없다 — v_math_streak(PG1)가 저장된 스트릭 카운터가
// 아니라 매번 math_daily_activity를 다시 훑어서 "오늘/어제까지 이어졌는지"를 계산하므로,
// 활동이 끊기면 다음 조회 때 자동으로 0으로 나온다. 그래서 여기서는 오래된 일별 활동 기록만
// 정리한다(무한히 쌓이지 않게) — 보관 기간은 스트릭 계산에 필요한 기간보다 넉넉히 잡았다.

const RETENTION_DAYS = 400;

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const db = serviceClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { error, count } = await db.from("math_daily_activity").delete({ count: "exact" }).lt("date", cutoff);
  if (error) return jsonError(500, `정리 실패: ${error.message}`);

  return Response.json({ ok: true, deleted: count ?? 0 });
}
