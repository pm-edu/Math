"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { site } from "@/lib/site";

// TOEFL 전용 헤더. 수학 사이트의 공용 Header(과목전환·언어토글·강좌메뉴)는 TOEFL과 무관해서
// 안 가져오고, TOEFL만의 최소 요소(브랜드 로고 + 로그인 상태)로 새로 만든다.
// 2026-08-18: "공용 Header를 안 쓰는 것 자체가 독립 사이트처럼 보이게 한다"고 판단했던 게
// 착각이었음 — 실제로는 메뉴가 아예 없어서 로그인해도 로그아웃할 방법조차 없었음. 독립 사이트로
// 보이려면 "네비게이션 없음"이 아니라 "자기만의 네비게이션"이 있어야 함.
// 응시 화면(test/[attemptId]/...)에는 이 헤더를 넣지 않는다 — spec §10 "시험 화면은 전역
// 네비게이션 숨김(전체화면 몰입)"이 명시적 요구사항이라, 그 페이지들의 무(無)네비게이션은
// 의도된 설계다. 이 헤더는 진입화면·리포트 화면·샘플 미리보기 화면에만 쓴다.
// 익명 로그인 분기는 제거함(2026-08-18) — 체험이 "진짜 시험 1회"에서 "가입 없이 보는 샘플
// 미리보기"로 범위가 좁아지면서 익명 세션 자체가 더 이상 필요 없어짐(/toefl/sample 참고).

export default function ToeflHeader() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function applyUser(user: { email?: string | null } | null | undefined) {
      setLoggedIn(!!user);
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
          {loggedIn && (
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
          {loggedIn === false && (
            <Link href="/login?toefl=1" className="text-xs font-medium text-[var(--pink-dark)] underline">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
