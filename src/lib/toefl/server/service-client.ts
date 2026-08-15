import { createClient } from "@supabase/supabase-js";

// toefl_module/toefl_item/toefl_stimulus는 학생에게 RLS로 잠겨 있다(직원만 직접 접근, spec §5).
// 서버가 응시 흐름(현재 모듈 판정·채점을 위한 정답 조회)을 처리하려면 service role이 필요하다.
// 이 클라이언트로 읽은 answer_key/explanation_*/transcript는 어떤 API 응답에도 그대로 담아
// 클라이언트로 돌려주지 않는다 — 오직 서버 내부 계산(채점·모듈 판정)에만 쓴다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function createToeflServiceClient() {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}
