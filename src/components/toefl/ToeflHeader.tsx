"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";
import GuestBadge from "./GuestBadge";

// TOEFL 전용 헤더. 수학 사이트의 공용 Header(과목전환·언어토글·강좌메뉴)는 TOEFL과 무관해서
// 안 가져오고, TOEFL만의 최소 요소(브랜드 로고 + 로그인 상태)로 새로 만든다.
// 2026-08-18: "공용 Header를 안 쓰는 것 자체가 독립 사이트처럼 보이게 한다"고 판단했던 게
// 착각이었음 — 실제로는 메뉴가 아예 없어서 로그인해도 로그아웃할 방법조차 없었음. 독립 사이트로
// 보이려면 "네비게이션 없음"이 아니라 "자기만의 네비게이션"이 있어야 함.
// 응시 화면(test/[attemptId]/...)에는 이 헤더를 넣지 않는다 — spec §10 "시험 화면은 전역
// 네비게이션 숨김(전체화면 몰입)"이 명시적 요구사항이라, 그 페이지들의 무(無)네비게이션은
// 의도된 설계다. 이 헤더는 진입화면·리포트 화면에만 쓴다.

export default function ToeflHeader() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function applyUser(user: { email?: string | null; is_anonymous?: boolean } | null | undefined) {
      setLoggedIn(!!user);
      setIsAnonymous(!!user?.is_anonymous);
      setEmail(user?.email ?? null);
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
          {isAnonymous && <GuestBadge />}
          {loggedIn && !isAnonymous && (
            <>
              {email && <span className="hidden text-xs text-[var(--secondary)] sm:inline">{email}</span>}
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-medium text-[var(--secondary)] underline hover:text-[var(--foreground)]"
              >
                Log out
              </button>
            </>
          )}
          {/* 익명(체험) 세션도 정식 계정으로 보면 "로그인 안 한" 상태다 — 체험 중에도 기존
              회원이 자기 계정으로 전환할 수 있는 길이 있어야 한다(실사용 피드백,
              "시범이나 가입은 있는데 로그인이 없다"). 로그인하면 이 익명 세션은 자연히
              버려지고 실제 계정 세션으로 바뀐다. */}
          {(loggedIn === false || isAnonymous) && (
            <Link href="/login?toefl=1" className="text-xs font-medium text-[var(--pink-dark)] underline">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
