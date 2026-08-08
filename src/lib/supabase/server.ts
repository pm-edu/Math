import { createClient } from "@supabase/supabase-js";

// 공개 데이터(강좌 목록 등)를 서버에서 읽기 위한 클라이언트.
// 로그인 세션이 필요 없는 조회 전용이며, 접근 범위는 RLS 정책이 결정한다.
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false } }
  );
}
