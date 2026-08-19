"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import { canManageMaterials } from "@/lib/roles";

// TOEFL 전용 헤더. 수학 사이트의 공용 Header(과목전환·언어토글·강좌메뉴)는 TOEFL과 무관해서
// 안 가져오고, TOEFL만의 최소 요소(브랜드 로고 + 로그인 상태)로 새로 만든다.
// 2026-08-18: "공용 Header를 안 쓰는 것 자체가 독립 사이트처럼 보이게 한다"고 판단했던 게
// 착각이었음 — 실제로는 메뉴가 아예 없어서 로그인해도 로그아웃할 방법조차 없었음. 독립 사이트로
// 보이려면 "네비게이션 없음"이 아니라 "자기만의 네비게이션"이 있어야 함.
// 응시 화면(test/[attemptId]/...)에는 이 헤더를 넣지 않는다 — spec §10 "시험 화면은 전역
// 네비게이션 숨김(전체화면 몰입)"이 명시적 요구사항이라, 그 페이지들의 무(無)네비게이션은
// 의도된 설계다. 이 헤더는 진입화면·마이페이지·사전점검·제출후·리포트·리뷰 화면에만 쓴다.
// 익명 로그인 분기는 제거함(2026-08-18) — 체험이 "진짜 시험 1회"에서 "가입 없이 보는 샘플
// 미리보기"로 범위가 좁아지면서 익명 세션 자체가 더 이상 필요 없어짐(/toefl/sample 참고).
//
// 언어 토글(2026-08-18 추가): 기존 사이트 전역 Header.tsx의 EN/한국어 버튼과 같은 방식으로
// src/lib/i18n.tsx의 공용 lang 쿠키/컨텍스트를 그대로 재사용한다(새 메커니즘 안 만듦). 시험
// 응시 화면(test/[attemptId]/...)과 /toefl/sample은 이 헤더 자체를 안 쓰거나(전자)
// showLanguageToggle=false로 토글만 숨겨서(후자) 항상 영어로 남는다 — spec §14 요구사항.

export default function ToeflHeader({ showLanguageToggle = true }: { showLanguageToggle?: boolean }) {
  const { lang, setLang, t } = useLang();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  // 관리 링크는 자료관리 권한이 있을 때만 보인다. 실제 차단은 화면이 아니라 RLS와
  // /admin/toefl 각 화면의 권한 검사가 하므로, 여기서는 표시 여부만 정한다.
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function checkRole(userId: string | undefined) {
      if (!userId) {
        setCanManage(false);
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      setCanManage(canManageMaterials(data?.role));
    }

    function applyUser(user: { id?: string; email?: string | null } | null | undefined) {
      setLoggedIn(!!user);
      setEmail(user?.email ?? null);
      checkRole(user?.id);
    }

    supabase.auth.getUser().then(({ data }) => applyUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/toefl";
  }

  return (
    <header data-theme="en" className="border-b border-[var(--border-c)] bg-[var(--background)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <Link href="/toefl" className="flex items-baseline gap-1.5 text-sm font-semibold tracking-wide text-[var(--foreground)]">
          <span>{site.name}</span>
          <span className="text-[var(--pink-dark)]">TOEFL</span>
        </Link>
        <div className="flex items-center gap-3">
          {showLanguageToggle && (
            <button
              type="button"
              onClick={() => setLang(lang === "ko" ? "en" : "ko")}
              aria-label={lang === "ko" ? "Switch to English" : "한국어로 전환"}
              className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
            >
              {lang === "ko" ? "EN" : "한국어"}
            </button>
          )}
          {loggedIn && (
            <>
              {email && <span className="hidden text-xs text-[var(--secondary)] sm:inline">{email}</span>}
              {canManage && (
                <Link
                  href="/admin/toefl"
                  className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pink)]/30"
                >
                  {t("admin")}
                </Link>
              )}
              <Link
                href="/toefl/mypage"
                className="text-xs font-medium text-[var(--secondary)] underline hover:text-[var(--foreground)]"
              >
                {t("mypage")}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-medium text-[var(--secondary)] underline hover:text-[var(--foreground)]"
              >
                {t("logout")}
              </button>
            </>
          )}
          {loggedIn === false && (
            <Link href="/login?toefl=1" className="text-xs font-medium text-[var(--pink-dark)] underline">
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
