import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TOEFL API 라우트 공통 인증. 다른 API 라우트들(generate-solution 등)과 같은 패턴:
// Authorization 헤더의 Bearer 토큰으로 로그인한 사용자 본인 권한의 클라이언트를 만든다.
// 이 클라이언트로 하는 모든 조회/쓰기는 RLS가 "본인 것만" 허용한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type ToeflAuthResult =
  | { ok: true; userId: string; isAnonymous: boolean; client: SupabaseClient }
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

  return { ok: true, userId: data.user.id, isAnonymous: !!data.user.is_anonymous, client };
}

// 유형별 연습(practice)처럼 "로그인하면 내 기록으로, 아니면 게스트로" 둘 다 허용하는 라우트용 —
// 로그인 안 했다고 401을 주지 않고 그냥 null을 돌려준다(호출부가 guest_id로 대신 처리).
export async function getOptionalToeflUserId(req: Request): Promise<string | null> {
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

// 관리자 전용 라우트(문항/오디오 생성 등)용. 다른 admin API(generate-solution 등)와 같은 역할 판정.
export async function requireToeflStaff(req: Request): Promise<ToeflAuthResult> {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return auth;
  const { data: me } = await auth.client.from("profiles").select("role").eq("id", auth.userId).maybeSingle();
  if (!["owner", "admin", "teacher", "assistant"].includes(me?.role ?? "")) {
    return { ok: false, status: 403, message: "권한이 없습니다." };
  }
  return auth;
}
