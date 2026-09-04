import { createClient } from "@supabase/supabase-js";

// sat_questions는 학생에게 RLS로 잠겨 있다(직원만 직접 접근 — supabase/migrations/202609021001_sat_rls.sql).
// 서버가 연습 채점(정답 조회)을 처리하려면 service role이 필요하다. 이 클라이언트로 읽은
// answer_key/explanation_ko는 API 응답에 그대로 담아 클라이언트로 돌려주지 않는다
// (src/lib/toefl/server/service-client.ts와 같은 원칙).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function createSatServiceClient() {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}
