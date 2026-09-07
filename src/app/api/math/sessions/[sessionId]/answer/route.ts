import { z } from "zod";
import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { submitAnswer } from "@/lib/math/server/session";

// 답안 제출·채점. RUN_MATH_PROGRESSION.md PG3 3-3 — 응답에 answer_spec/정답을 절대 담지 않는다
// (submitAnswer가 반환하는 값 자체가 {correct, solution}뿐이라 여기서 더 뺄 것도 없다).

const bodySchema = z.object({
  position: z.number().int().min(0),
  submitted: z.string().min(1),
  elapsedSeconds: z.number().int().min(0).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const { sessionId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  try {
    const result = await submitAnswer(
      auth.userId,
      Number(sessionId),
      parsed.data.position,
      parsed.data.submitted,
      parsed.data.elapsedSeconds
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return jsonError(400, (e as Error).message);
  }
}
