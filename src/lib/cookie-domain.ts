/**
 * 로그인 세션·언어 설정처럼 "과목(수학/영어)과 무관하게 공유돼야 하는" 쿠키에 쓴다.
 * pmedu4u.com / english.pmedu4u.com 두 서브도메인이 값을 공유하도록 도메인을 지정한다.
 * localhost 등 로컬 개발 환경에서는 도메인 지정 쿠키를 만들 수 없으므로 지정하지 않는다.
 * (subject 쿠키는 반대로 도메인마다 달라야 하는 값이라 이 함수를 쓰지 않는다.)
 */
export function sharedCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.hostname.endsWith("pmedu4u.com") ? ".pmedu4u.com" : undefined;
}
