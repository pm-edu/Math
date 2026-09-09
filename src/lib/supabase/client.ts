import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieDomain } from "@/lib/cookie-domain";

// pmedu4u.com(수학) / english.pmedu4u.com(영어) 두 서브도메인이 로그인 세션을 공유하도록
// 쿠키 도메인을 지정한다. 안 하면 한쪽 사이트에서 로그인해도 다른 쪽에선 로그아웃 상태로 보인다.
//
// 로그인 쿠키를 "브라우저를 완전히 닫으면 사라지는" 세션 쿠키로 만든다(2026-09-09,
// "웹사이트를 떠나면 로그아웃" 요청 — 공용 PC에서 다음 사람이 이전 계정으로 남아있는 걸
// 막기 위함). @supabase/ssr(0.12.x)이 기본 쿠키 저장 경로에서 maxAge를 400일로 강제 고정해
// cookieOptions.maxAge를 넘겨도 무시되므로, 쿠키를 직접 쓰는 getAll/setAll을 넣어 우회한다.
// 삭제 요청(로그아웃 시 maxAge=0)은 그대로 반영해야 실제로 지워지므로 그 경우만 예외로 둔다.
// 탭 전환·새로고침은 세션 쿠키에 영향 없음 — 브라우저(모든 창)를 완전히 닫을 때만 사라진다.
export function createClient() {
  const domain = sharedCookieDomain();

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookieOptions: { domain },
      cookies: {
        getAll() {
          if (typeof document === "undefined") return [];
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((pair) => {
              const idx = pair.indexOf("=");
              return {
                name: pair.slice(0, idx),
                value: decodeURIComponent(pair.slice(idx + 1)),
              };
            });
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            let str = `${name}=${encodeURIComponent(value)}`;
            if (domain) str += `; Domain=${domain}`;
            str += `; Path=${options?.path ?? "/"}`;
            // maxAge 0은 삭제 요청 — 그대로 반영. 그 외(로그인 유지용)는 일부러 안 넣어 세션 쿠키로.
            if (options?.maxAge === 0) str += `; Max-Age=0`;
            str += `; SameSite=${options?.sameSite ?? "lax"}`;
            if (window.location.protocol === "https:") str += "; Secure";
            document.cookie = str;
          });
        },
      },
    }
  );
}
