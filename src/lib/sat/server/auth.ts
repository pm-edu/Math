import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SAT API 라우트 공통 인증. src/lib/toefl/server/auth.ts와 같은 패턴 — Authorization 헤더의
// Bearer 토큰으로 로그인 사용자를 확인한다. SAT 연습은 (TOEFL과 달리) 지금 단계에서는
// 게스트를 지원하지 않는다 — 별도 게스트 기록 테이블을 새로 만들지 않기 위한 범위 제한.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type SatAuthResult =
  | { ok: true; userId: string; client: SupabaseClient }
  | { ok: false; status: number; message: string };

export async function requireSatUser(req: Request): Promise<SatAuthResult> {
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
