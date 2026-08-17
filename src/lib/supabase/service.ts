import { createClient } from "@supabase/supabase-js";

// RLS를 우회해야 하는 서버 전용 작업(예: 로그인 없는 공개 토큰 링크 조회)에 쓴다.
// 이 클라이언트로 읽은 값은 반드시 서버에서 필요한 것만 골라 응답에 담을 것 — 통째로 넘기지 않는다.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function createServiceClient() {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}
