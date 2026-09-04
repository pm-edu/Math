"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { SITE_URL } from "@/lib/subject";
import { useLang } from "@/lib/i18n";
import { canManageMaterials } from "@/lib/roles";

// SAT 전용 헤더. src/components/toefl/ToeflHeader.tsx와 같은 이유로 같은 구조 —
// 공용 Header(과목전환·강좌메뉴)는 SAT와 무관해서 안 쓰고, SAT만의 최소 네비게이션을 둔다.
export default function SatHeader({ showLanguageToggle = true }: { showLanguageToggle?: boolean }) {
  const { lang, setLang, t } = useLang();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
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
    window.location.href = "/sat";
  }

  return (
    <header data-theme="en" className="border-b border-[var(--border-c)] bg-[var(--background)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-sm font-semibold tracking-wide text-[var(--foreground)]">
          <a href={SITE_URL.math} title="PM EDU 메인으로" className="hover:text-[var(--secondary)]">
            {site.name}
          </a>
          <Link href="/sat" title="SAT 메인으로" className="text-[var(--pink-dark)] hover:underline">
            SAT
          </Link>
        </span>
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
                  href="/admin/digital-sat"
                  className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--pink)]/30"
                >
                  {t("admin")}
                </Link>
              )}
              <Link
                href="/sat/mypage"
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
            <Link href="/login?sat=1" className="text-xs font-medium text-[var(--pink-dark)] underline">
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
