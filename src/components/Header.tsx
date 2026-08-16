"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import { isStaff } from "@/lib/roles";
import { useSubject, subjectLabel, SUBJECTS, SITE_URL } from "@/lib/subject";

export default function Header() {
  const { lang, setLang, t } = useLang();
  const { subject } = useSubject();
  // null = 아직 확인 중. 확인 전에는 로그인/마이페이지 중 어느 쪽도 보여주지 않아
  // 화면이 깜빡이지 않게 한다.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // 관리자에게만 관리 메뉴를 보여준다.
    // 실제 접근 차단은 화면이 아니라 DB 정책이 하므로, 여기서는 표시 여부만 정한다.
    async function checkRole(userId: string | undefined) {
      if (!userId) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      setIsAdmin(isStaff(data?.role));
    }

    supabase.auth.getUser().then(({ data }) => {
      setLoggedIn(!!data.user);
      checkRole(data.user?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
      checkRole(session?.user?.id);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-c)] bg-[var(--background)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-10 px-6 py-4">
        <Link href="/" className="text-lg font-medium text-[var(--foreground)]">
          {site.name}
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {site.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center rounded-full border border-[var(--border-c)] bg-white p-0.5 text-xs font-medium">
            {SUBJECTS.map((s) =>
              s === subject ? (
                <span
                  key={s}
                  className="rounded-full bg-[var(--pink)] px-3 py-1 text-[var(--pink-dark)]"
                >
                  {subjectLabel(s, lang)}
                </span>
              ) : (
                <a
                  key={s}
                  href={SITE_URL[s]}
                  className="rounded-full px-3 py-1 text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
                >
                  {subjectLabel(s, lang)}
                </a>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => setLang(lang === "ko" ? "en" : "ko")}
            aria-label={lang === "ko" ? "Switch to English" : "한국어로 전환"}
            className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--secondary)] transition-colors hover:text-[var(--foreground)]"
          >
            {lang === "ko" ? "EN" : "한국어"}
          </button>
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
            >
              {t("admin")}
            </Link>
          )}
          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/mypage" : "/login"}
              className="hidden text-sm text-[var(--secondary)] hover:text-[var(--foreground)] md:inline"
            >
              {loggedIn ? t("mypage") : t("login")}
            </Link>
          )}
          {loggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="hidden text-sm text-[var(--secondary)] hover:text-[var(--foreground)] md:inline"
            >
              {t("logout")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileOpen}
            className="rounded-full border border-[var(--border-c)] bg-white p-2 text-[var(--foreground)] md:hidden"
          >
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 3l12 12M15 3L3 15" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 4.5h14M2 9h14M2 13.5h14" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[var(--border-c)] bg-[var(--background)] px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {site.nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
              >
                {t(item.key)}
              </Link>
            ))}
            {loggedIn !== null && (
              <Link
                href={loggedIn ? "/mypage" : "/login"}
                onClick={() => setMobileOpen(false)}
                className="text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
              >
                {loggedIn ? t("mypage") : t("login")}
              </Link>
            )}
            {loggedIn && (
              <button
                type="button"
                onClick={() => { setMobileOpen(false); handleLogout(); }}
                className="text-left text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
              >
                {t("logout")}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
