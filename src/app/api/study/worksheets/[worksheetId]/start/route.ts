import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { startWorksheet } from "@/lib/math/server/worksheet";

// RUN_MATH_SITE.md 5-1: 문제지 풀이 시작. answer_spec/정답은 startWorksheet 반환값 자체에
// 없으니(WorksheetItemView) 여기서 더 뺄 것도 없다.
export async function POST(req: Request, { params }: { params: Promise<{ worksheetId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { worksheetId } = await params;
  try {
    const result = await startWorksheet(auth.userId, worksheetId);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes("권한이 없습니다")) return jsonError(403, message);
    return jsonError(400, message);
  }
}
