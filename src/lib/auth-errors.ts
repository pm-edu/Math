import type { AuthError } from "@supabase/supabase-js";

// Supabase가 돌려주는 실패 원인을 사용자에게 보여줄 한국어 문구로 옮긴다.
// 원인을 뭉뚱그리면 "비밀번호가 틀렸나?" 하고 엉뚱한 곳을 헤매게 된다.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  email_not_confirmed:
    "아직 이메일 인증이 끝나지 않았습니다. 메일함에서 인증 링크를 눌러주세요.",
  user_already_exists: "이미 가입된 이메일입니다. 로그인해주세요.",
  email_exists: "이미 가입된 이메일입니다. 로그인해주세요.",
  weak_password: "비밀번호가 너무 단순합니다. 6자 이상으로 만들어주세요.",
  over_email_send_rate_limit:
    "인증 메일을 너무 자주 보냈습니다. 잠시 후 다시 시도해주세요.",
  over_request_rate_limit: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  validation_failed: "입력한 값을 다시 확인해주세요.",
};

export function authErrorMessage(error: AuthError, fallback: string): string {
  return (error.code && MESSAGES[error.code]) || fallback;
}
