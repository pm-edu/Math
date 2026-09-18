import { z } from "zod";
import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { submitAnswer } from "@/lib/math/server/worksheet";

const bodySchema = z.object({
  problemId: z.string().uuid(),
  submitted: z.string().min(1),
  elapsedSeconds: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ worksheetId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { worksheetId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  try {
    const result = await submitAnswer(
      auth.userId,
      worksheetId,
      parsed.data.problemId,
      parsed.data.submitted,
      parsed.data.elapsedSeconds
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
