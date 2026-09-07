import { z } from "zod";
import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { submitDiagnosticAnswer } from "@/lib/math/server/diagnostic";

const bodySchema = z.object({ submitted: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { sessionId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  try {
    const result = await submitDiagnosticAnswer(auth.userId, Number(sessionId), parsed.data.submitted);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
