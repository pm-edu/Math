import { z } from "zod";
import { jsonError, requireMathUser } from "@/lib/math/server/auth";
import { createSession, getActiveSession, type SessionKind } from "@/lib/math/server/session";

// 세션 시작. RUN_MATH_PROGRESSION.md PG3 3-1 — 새로고침 복구는 이 엔드포인트(GET)가 서버
// 상태(math_sessions.status='in_progress')만 보고 판단한다. 로컬스토리지에 의존하지 않는다.

const KINDS = ["practice", "review", "diagnostic", "lesson"] as const satisfies readonly SessionKind[];

const createBodySchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(KINDS).default("practice"),
});

export async function POST(req: Request) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = createBodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  try {
    const result = await createSession(auth.userId, parsed.data.unitId, parsed.data.kind);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = (e as Error).message;
    // requireEntitlement(entitlement.ts)가 던지는 메시지 형식 — 접근권 없음은 다른 409(예:
    // "이미 진행 중인 세션이 있습니다")와 구분해서 403으로 내려줘야 클라이언트가 /study/notice로
    // 보낼지, 그냥 에러 문구만 보여줄지 나눌 수 있다.
    if (message.startsWith("권한이 없습니다")) return jsonError(403, message);
    return jsonError(409, message);
  }
}

// 진행 중인 세션이 있으면 그 상태(문항 목록 + 이미 답한 개수)를 돌려준다 — 없으면 null.
export async function GET(req: Request) {
  const auth = await requireMathUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");
  if (!unitId) return jsonError(400, "unitId가 필요합니다.");

  const active = await getActiveSession(auth.userId, unitId);
  return Response.json({ ok: true, active });
}
