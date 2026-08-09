"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";

export default function Header() {
  // null = 아직 확인 중. 확인 전에는 로그인/마이페이지 중 어느 쪽도 보여주지 않아
  // 화면이 깜빡이지 않게 한다.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
      setIsAdmin(data?.role === "admin");
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

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-c)] bg-[var(--background)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
            >
              관리
            </Link>
          )}
          {site.partner && (
            <a
              href={site.partner.url}
              className="hidden text-sm text-[var(--secondary)] transition-colors hover:text-[var(--foreground)] sm:inline"
            >
              {site.partner.label} →
            </a>
          )}
          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/mypage" : "/login"}
              className="hidden text-sm text-[var(--secondary)] hover:text-[var(--foreground)] sm:inline"
            >
              {loggedIn ? "마이페이지" : "로그인"}
            </Link>
          )}
          <Link
            href="/courses"
            className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.03]"
          >
            강좌 보기
          </Link>
        </div>
      </div>
    </header>
  );
}
