import type { AuthError } from "@supabase/supabase-js";

type Lang = "ko" | "en";

// Supabase가 돌려주는 실패 원인을 사용자에게 보여줄 문구로 옮긴다. 원인을 뭉뚱그리면
// "비밀번호가 틀렸나?" 하고 엉뚱한 곳을 헤매게 된다.
// (2026-09-15: 영어 화면에서도 한국어 에러가 뜨는 문제 발견 — lang별로 나눔.)
const MESSAGES: Record<string, Record<Lang, string>> = {
  invalid_credentials: {
    ko: "이메일 또는 비밀번호가 올바르지 않습니다.",
    en: "Incorrect email or password.",
  },
  email_not_confirmed: {
    ko: "아직 이메일 인증이 끝나지 않았습니다. 메일함에서 인증 링크를 눌러주세요.",
    en: "Your email hasn't been verified yet. Please click the link in your inbox.",
  },
  user_already_exists: {
    ko: "이미 가입된 이메일입니다. 로그인해주세요.",
    en: "This email is already registered. Please log in.",
  },
  email_exists: {
    ko: "이미 가입된 이메일입니다. 로그인해주세요.",
    en: "This email is already registered. Please log in.",
  },
  weak_password: {
    ko: "비밀번호가 너무 단순합니다. 6자 이상으로 만들어주세요.",
    en: "Password is too weak. Use at least 6 characters.",
  },
  over_email_send_rate_limit: {
    ko: "인증 메일을 너무 자주 보냈습니다. 잠시 후 다시 시도해주세요.",
    en: "Too many verification emails sent. Please try again later.",
  },
  over_request_rate_limit: {
    ko: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
    en: "Too many requests. Please try again later.",
  },
  validation_failed: {
    ko: "입력한 값을 다시 확인해주세요.",
    en: "Please check the values you entered.",
  },
};

export function authErrorMessage(error: AuthError, lang: Lang, fallback: string): string {
  const entry = error.code ? MESSAGES[error.code] : undefined;
  return entry?.[lang] ?? fallback;
}
