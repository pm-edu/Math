// 유형별 연습에서 비로그인 게스트를 구분하는 로컬 식별자. 인증이 아니다 — 그냥 브라우저에
// 저장된 UUID라 다른 기기/시크릿창에서는 별개로 취급된다(연습 기록이 안 이어져도 기능엔
// 문제 없음, 통계용일 뿐). Supabase 익명 로그인은 2026-08-15에 이미 도입→롤백한 방식이라
// 다시 쓰지 않는다([[toefl-subsystem-plan]] 참고).

const KEY = "toefl_guest_id";

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
