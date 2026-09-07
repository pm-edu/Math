import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isStaff } from "@/lib/roles";

// 수학 진행 구조 API 라우트 공통 인증. TOEFL 패턴(src/lib/toefl/server/auth.ts) 복제(D-PG-7) —
// Authorization 헤더의 Bearer 토큰으로 로그인한 사용자 본인 권한의 클라이언트를 만든다.
// 이 클라이언트로 하는 모든 조회/쓰기는 RLS가 "본인 것만" 허용한다.
// TOEFL 원본과 달리 staff 판정은 역할 배열을 새로 하드코딩하지 않고 기존 src/lib/roles.ts의
// isStaff()를 그대로 쓴다 — 지시서 전역 금지사항(새 role 판정 로직 작성 금지) 준수.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type MathAuthResult =
  | { ok: true; userId: string; client: SupabaseClient }
  | { ok: false; status: number; message: string };

export async function requireMathUser(req: Request): Promise<MathAuthResult> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, message: "로그인이 필요합니다." };

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  if (!data.user) return { ok: false, status: 401, message: "로그인이 필요합니다." };

  return { ok: true, userId: data.user.id, client };
}

// 로그인하면 내 기록으로, 아니면 null(호출부가 안내 화면 등으로 대신 처리)을 돌려준다.
export async function getOptionalMathUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

export function jsonError(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}

// 관리자 화면(선수관계 편집, entitlement 부여 등)용.
export async function requireMathStaff(req: Request): Promise<MathAuthResult> {
  const auth = await requireMathUser(req);
  if (!auth.ok) return auth;
  const { data: me } = await auth.client.from("profiles").select("role").eq("id", auth.userId).maybeSingle();
  if (!isStaff(me?.role)) {
    return { ok: false, status: 403, message: "권한이 없습니다." };
  }
  return auth;
}

// Vercel Cron 라우트(PG5 5-2)용. Vercel이 요청에 실어 보내는 값과 서버 환경변수를 직접
// 비교한다 — 로그인 사용자 개념이 없는 배치 작업이라 requireMathUser와는 별개다.
export function requireCronSecret(req: Request): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, message: "CRON_SECRET이 설정되지 않았습니다." };
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return { ok: false, status: 401, message: "인증되지 않았습니다." };
  return { ok: true };
}
