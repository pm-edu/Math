import { createClient } from "@supabase/supabase-js";

// 가입 직후 전화번호·커리큘럼·약관/개인정보 동의 시각을 서버에서 기록한다.
// profiles.terms_agreed_at / privacy_agreed_at은 authenticated에게 UPDATE 권한이 없다
// (supabase/migrations/202609151500_signup_hardening.sql) — 동의 시각은 클라이언트가
// 못 쓰게 하라는 지시라 여기 service_role로만 기록한다.
//
// 이메일 인증이 켜져 있으면 signUp() 직후엔 세션이 없어(확인 전) Bearer 토큰으로 본인 확인을
// 할 수가 없다 — 그래서 클라이언트가 signUp() 응답에서 받은 userId를 그대로 보내고, 서버는
// "해당 프로필의 terms_agreed_at이 아직 null일 때만" 한 번 기록해준다(이미 채워져 있으면
// 거부) — 가입 직후 딱 한 번만 쓸 수 있는 일회성 엔드포인트로 남용 여지를 최소화한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const PHONE_RE = /^(\+82|\+91|0)[0-9\-\s]{7,14}$/;
const CURRICULUM_VALUES = ["KR", "IB", "IGCSE", "CBSE", "AS_A_Level"];

export async function POST(req: Request) {
  if (!SERVICE_KEY) return json(500, "가입 처리가 아직 설정되지 않았습니다. (SUPABASE_SERVICE_ROLE_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    phone?: string;
    curriculumGroup?: string;
    termsAgreed?: boolean;
    privacyAgreed?: boolean;
  };

  const { userId, phone, curriculumGroup, termsAgreed, privacyAgreed } = body;
  if (!userId) return json(400, "잘못된 요청입니다.");
  if (!phone || !PHONE_RE.test(phone)) return json(400, "전화번호 형식을 확인해주세요.");
  if (!curriculumGroup || !CURRICULUM_VALUES.includes(curriculumGroup)) return json(400, "커리큘럼을 선택해주세요.");
  if (!termsAgreed || !privacyAgreed) return json(400, "이용약관과 개인정보처리방침에 모두 동의해야 합니다.");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from("profiles")
    .update({ phone, curriculum_group: curriculumGroup, terms_agreed_at: nowIso, privacy_agreed_at: nowIso })
    .eq("id", userId)
    .is("terms_agreed_at", null)
    .select("id");

  if (error) return json(502, "가입 정보를 저장하지 못했습니다.");
  if (!data || data.length === 0) return json(409, "이미 처리된 가입입니다.");

  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
