import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TOEFL API 라우트 공통 인증. 다른 API 라우트들(generate-solution 등)과 같은 패턴:
// Authorization 헤더의 Bearer 토큰으로 로그인한 사용자 본인 권한의 클라이언트를 만든다.
// 이 클라이언트로 하는 모든 조회/쓰기는 RLS가 "본인 것만" 허용한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type ToeflAuthResult =
  | { ok: true; userId: string; client: SupabaseClient }
  | { ok: false; status: number; message: string };

export async function requireToeflUser(req: Request): Promise<ToeflAuthResult> {
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

export function jsonError(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
