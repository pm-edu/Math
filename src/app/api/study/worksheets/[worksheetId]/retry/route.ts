import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { retryWrong } from "@/lib/math/server/worksheet";

// 정답률 80% 미달 시 오답만 다시 푸는 목적(RUN_MATH_SITE.md 1단계).
export async function POST(req: Request, { params }: { params: Promise<{ worksheetId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { worksheetId } = await params;
  try {
    const items = await retryWrong(auth.userId, worksheetId);
    return Response.json({ ok: true, items });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
