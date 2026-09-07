import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { completeSession } from "@/lib/math/server/session";

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { sessionId } = await params;
  try {
    const result = await completeSession(auth.userId, Number(sessionId));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
