import { z } from "zod";
import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { createDiagnosticSession } from "@/lib/math/server/diagnostic";

const bodySchema = z.object({ curriculumDetail: z.string().min(1) });

export async function POST(req: Request) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  try {
    const result = await createDiagnosticSession(auth.userId, parsed.data.curriculumDetail);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(409, (e as Error).message);
  }
}
