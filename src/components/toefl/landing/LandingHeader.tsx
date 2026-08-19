"use client";

// TOEFL 랜딩 전용 헤더 (docs/toefl-main.html 의 <header>).
// 응시·리포트 화면이 쓰는 ToeflHeader와는 별개다 — 저쪽은 최소 헤더(로고+로그인)이고,
// 이쪽은 랜딩용 풀 네비게이션(메뉴 5개 + 언어 토글 + CTA + 모바일 햄버거)이다.
//
// 언어 토글은 새로 만들지 않고 사이트 전역 메커니즘(src/lib/i18n.tsx의 useLang)을 그대로 쓴다.
// 쿠키가 .pmedu4u.com 도메인이라 수학 사이트와 설정이 공유된다.
// 햄버거는 재사용할 컴포넌트가 없어(수학 Header.tsx 안에 인라인으로만 존재) 같은 패턴으로 새로 둔다.
// 메뉴 문구는 아직 한국어 하드코딩 — 번역 연결은 이후 단계에서 일괄 처리한다.

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { toeflLogout, useLandingViewer } from "@/lib/toefl/landing-viewer";

// TODO: 유형별 연습 전용 라우트가 생기면 "#types" 앵커 대신 그 경로로 교체한다.
// 영역 연습·모의고사는 아직 별도 라우트가 없어 둘 다 /toefl/start(폼 선택 화면)로 보낸다.
const MENU: { label: string; href: string }[] = [
  { label: "시험 안내", href: "#about" },
  { label: "유형별 연습", href: "#types" },
  { label: "영역 연습", href: "/toefl/start" },
  { label: "모의고사", href: "/toefl/start" },
  { label: "내 학습", href: "/toefl/mypage" },
];

export default function LandingHeader() {
  const { lang, setLang } = useLang();
  // 관리 링크는 자료관리 권한이 있을 때만 보인다. /admin/toefl 레이아웃이 같은 기준으로
  // 다시 막으므로(그리고 진짜 방어선은 DB의 RLS), 여기서는 표시 여부만 정한다.
  const { loggedIn, canManage } = useLandingViewer();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--en-line)] bg-[rgba(247,249,253,.88)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-7 px-6">
        <Link href="/toefl" className="flex items-baseline gap-2 text-[17px] font-extrabold tracking-[-.02em]">
          <span>PM EDU</span>
          <span className="en-num rounded-md border-[1.5px] border-[var(--en-gold)] px-[7px] py-px text-[13px] font-bold uppercase tracking-[.12em] text-[var(--en-gold-deep)]">
            TOEFL
          </span>
        </Link>

        <nav className="ml-2 hidden gap-1 min-[961px]:flex" aria-label="주 메뉴">
          {MENU.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="rounded-lg px-3 py-[7px] text-[14.5px] font-semibold text-[var(--en-ink-soft)] transition-colors hover:bg-[#EDF2FB] hover:text-[var(--en-ink)]"
            >
              {m.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLang(lang === "ko" ? "en" : "ko")}
            aria-label={lang === "ko" ? "Switch to English" : "한국어로 전환"}
            className="rounded-full border border-[var(--en-line)] bg-white px-3 py-[5px] text-[12.5px] font-bold text-[var(--en-ink-soft)]"
          >
            한 / EN
          </button>

          {canManage && (
            <Link
              href="/admin/toefl"
              className="hidden rounded-lg border border-[var(--en-line)] bg-white px-3 py-1.5 text-[13px] font-bold text-[var(--en-ink)] transition-colors hover:border-[var(--en-ink)] min-[601px]:inline-flex"
            >
              관리
            </Link>
          )}

          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/toefl/mypage" : "/login?toefl=1"}
              className="hidden rounded-lg px-3.5 py-2 text-sm font-bold text-[var(--en-ink)] transition-colors hover:bg-[#EDF2FB] min-[601px]:inline-flex"
            >
              {loggedIn ? "내 학습" : "로그인"}
            </Link>
          )}

          {loggedIn && (
            <button
              type="button"
              onClick={toeflLogout}
              className="hidden rounded-lg px-2.5 py-2 text-sm font-semibold text-[var(--en-ink-soft)] transition-colors hover:bg-[#EDF2FB] hover:text-[var(--en-ink)] min-[601px]:inline-flex"
            >
              로그아웃
            </button>
          )}

          {/* 계정이 있는 사람에게는 샘플이 필요 없다 — 바로 응시로 보낸다.
              확인 중(null)일 때는 라벨이 뒤바뀌지 않도록 아직 그리지 않는다. */}
          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/toefl/start" : "/toefl/sample"}
              className="hidden items-center rounded-lg bg-[var(--en-gold)] px-[18px] py-[9px] text-sm font-bold text-[var(--en-on-gold)] shadow-[0_2px_8px_rgba(245,166,35,.35)] transition-transform hover:-translate-y-px min-[601px]:inline-flex"
            >
              {loggedIn ? "모의고사 시작" : "무료 샘플 풀어보기"}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={open}
            className="text-[22px] leading-none text-[var(--en-ink)] min-[961px]:hidden"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--en-line)] bg-[var(--en-paper)] px-6 py-4 min-[961px]:hidden">
          <nav className="flex flex-col gap-1" aria-label="모바일 메뉴">
            {MENU.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[var(--en-ink-soft)] hover:bg-[#EDF2FB] hover:text-[var(--en-ink)]"
              >
                {m.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--en-line)] pt-3">
              {canManage && (
                <Link
                  href="/admin/toefl"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2 text-[15px] font-bold text-[var(--en-ink)]"
                >
                  관리
                </Link>
              )}
              <Link
                href={loggedIn ? "/toefl/mypage" : "/login?toefl=1"}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-[15px] font-bold text-[var(--en-ink)]"
              >
                {loggedIn ? "내 학습" : "로그인"}
              </Link>
              {loggedIn && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); toeflLogout(); }}
                  className="rounded-lg px-2 py-2 text-left text-[15px] font-semibold text-[var(--en-ink-soft)]"
                >
                  로그아웃
                </button>
              )}
              <Link
                href={loggedIn ? "/toefl/start" : "/toefl/sample"}
                onClick={() => setOpen(false)}
                className="rounded-lg bg-[var(--en-gold)] px-4 py-2.5 text-center text-sm font-bold text-[var(--en-on-gold)]"
              >
                {loggedIn ? "모의고사 시작" : "무료 샘플 풀어보기"}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
