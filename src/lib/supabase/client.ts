import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieDomain } from "@/lib/cookie-domain";

// pmedu4u.com(수학) / english.pmedu4u.com(영어) 두 서브도메인이 로그인 세션을 공유하도록
// 쿠키 도메인을 지정한다. 안 하면 한쪽 사이트에서 로그인해도 다른 쪽에선 로그아웃 상태로 보인다.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { cookieOptions: { domain: sharedCookieDomain() } }
  );
}
