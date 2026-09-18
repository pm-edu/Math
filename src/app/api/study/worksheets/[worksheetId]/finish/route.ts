import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { finishWorksheet } from "@/lib/math/server/worksheet";

export async function POST(req: Request, { params }: { params: Promise<{ worksheetId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { worksheetId } = await params;
  try {
    const result = await finishWorksheet(auth.userId, worksheetId);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
