"use client";

// TOEFL 랜딩 전용 헤더 (docs/toefl-main.html 의 <header>).
// 응시·리포트 화면이 쓰는 ToeflHeader와는 별개다 — 저쪽은 최소 헤더(로고+로그인)이고,
// 이쪽은 랜딩용 풀 네비게이션(메뉴 5개 + 언어 토글 + CTA + 모바일 햄버거)이다.
//
// 언어 토글은 새로 만들지 않고 사이트 전역 메커니즘(src/lib/i18n.tsx의 useLang)을 그대로 쓴다.
// 쿠키가 .pmedu4u.com 도메인이라 수학 사이트와 설정이 공유된다.
// 햄버거는 재사용할 컴포넌트가 없어(수학 Header.tsx 안에 인라인으로만 존재) 같은 패턴으로 새로 둔다.
// 메뉴 문구는 t()로 번역돼 있다(2026-09-02, 인도 서비스 대비 학생용 화면 일괄 번역).

import { useState } from "react";
import Link from "next/link";
import { interpolate, useLang, type DictKey } from "@/lib/i18n";
import { toeflLogout, useLandingViewer } from "@/lib/toefl/landing-viewer";
import { SITE_URL } from "@/lib/subject";

// TODO: 유형별 연습 전용 라우트가 생기면 "#types" 앵커 대신 그 경로로 교체한다.
// 영역 연습·모의고사는 아직 별도 라우트가 없어 둘 다 /toefl/start(폼 선택 화면)로 보낸다.
const MENU: { labelKey: DictKey; href: string }[] = [
  { labelKey: "toefl_navExamInfo", href: "#about" },
  { labelKey: "toefl_navByType", href: "#types" },
  { labelKey: "toefl_navBySection", href: "/toefl/start?focus=section" },
  { labelKey: "toefl_navFullTest", href: "/toefl/start?focus=full" },
  { labelKey: "toefl_navMyStudy", href: "/toefl/mypage" },
];

export default function LandingHeader() {
  const { lang, setLang, t } = useLang();
  // 관리 링크는 자료관리 권한이 있을 때만 보인다. /admin/toefl 레이아웃이 같은 기준으로
  // 다시 막으므로(그리고 진짜 방어선은 DB의 RLS), 여기서는 표시 여부만 정한다.
  const { loggedIn, canManage, label } = useLandingViewer();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--en-line)] bg-[rgba(247,249,253,.88)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-7 px-6">
        {/* 로고는 두 개의 독립 링크다 — PM EDU는 회사 메인(수학 사이트), TOEFL은 이 사이트 메인.
            하나로 묶여 있으면 TOEFL 랜딩에서 로고를 눌러도 같은 페이지라 아무 일도 안 일어난다. */}
        <span className="flex shrink-0 items-baseline gap-2 whitespace-nowrap text-[17px] font-extrabold tracking-[-.02em]">
          <a
            href={SITE_URL.math}
            className="whitespace-nowrap rounded transition-colors hover:text-[var(--en-ink-soft)]"
            title={t("toefl_header_pmeduHome")}
          >
            PM EDU
          </a>
          <Link
            href="/toefl"
            title={t("toefl_header_toeflHome")}
            className="en-num rounded-md border-[1.5px] border-[var(--en-gold)] px-[7px] py-px text-[13px] font-bold uppercase tracking-[.12em] text-[var(--en-gold-deep)] transition-colors hover:bg-[var(--en-gold-soft)]"
          >
            TOEFL
          </Link>
        </span>

        <nav className="ml-2 hidden shrink-0 gap-1 min-[1080px]:flex" aria-label={t("toefl_header_mainNav")}>
          {MENU.map((m) => (
            <Link
              key={m.labelKey}
              href={m.href}
              className="shrink-0 whitespace-nowrap rounded-lg px-3 py-[7px] text-[14.5px] font-semibold text-[var(--en-ink-soft)] transition-colors hover:bg-[#EDF2FB] hover:text-[var(--en-ink)]"
            >
              {t(m.labelKey)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLang(lang === "ko" ? "en" : "ko")}
            aria-label={lang === "ko" ? "Switch to English" : "한국어로 전환"}
            className="shrink-0 whitespace-nowrap rounded-full border border-[var(--en-line)] bg-white px-3 py-[5px] text-[12.5px] font-bold text-[var(--en-ink-soft)]"
          >
            한 / EN
          </button>

          {/* 누구로 로그인했는지 항상 보이게 한다(이름 없으면 이메일). 좁은 화면에서는 숨긴다. */}
          {loggedIn && label && (
            <span
              title={label}
              className="hidden max-w-[160px] truncate text-[12.5px] font-semibold text-[var(--en-ink-soft)] min-[861px]:inline"
            >
              {label}
            </span>
          )}

          {canManage && (
            <Link
              href="/admin/toefl"
              className="hidden shrink-0 whitespace-nowrap rounded-lg border border-[var(--en-line)] bg-white px-3 py-1.5 text-[13px] font-bold text-[var(--en-ink)] transition-colors hover:border-[var(--en-ink)] min-[601px]:inline-flex"
            >
              {t("admin")}
            </Link>
          )}

          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/toefl/mypage" : "/login?toefl=1"}
              className="hidden shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-bold text-[var(--en-ink)] transition-colors hover:bg-[#EDF2FB] min-[601px]:inline-flex"
            >
              {loggedIn ? t("toefl_navMyStudy") : t("login")}
            </Link>
          )}

          {loggedIn && (
            <button
              type="button"
              onClick={toeflLogout}
              className="hidden shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-[var(--en-ink-soft)] transition-colors hover:bg-[#EDF2FB] hover:text-[var(--en-ink)] min-[601px]:inline-flex"
            >
              {t("logout")}
            </button>
          )}

          {/* 계정이 있는 사람에게는 샘플이 필요 없다 — 바로 응시로 보낸다.
              확인 중(null)일 때는 라벨이 뒤바뀌지 않도록 아직 그리지 않는다. */}
          {loggedIn !== null && (
            <Link
              href={loggedIn ? "/toefl/start?focus=full" : "/toefl/sample"}
              className="hidden shrink-0 items-center whitespace-nowrap rounded-lg bg-[var(--en-gold)] px-[18px] py-[9px] text-sm font-bold text-[var(--en-on-gold)] shadow-[0_2px_8px_rgba(245,166,35,.35)] transition-transform hover:-translate-y-px min-[601px]:inline-flex"
            >
              {loggedIn ? t("toefl_startTest") : t("toefl_tryFreeSample")}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t("toefl_header_closeMenu") : t("toefl_header_openMenu")}
            aria-expanded={open}
            className="text-[22px] leading-none text-[var(--en-ink)] min-[1080px]:hidden"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--en-line)] bg-[var(--en-paper)] px-6 py-4 min-[1080px]:hidden">
          <nav className="flex flex-col gap-1" aria-label={t("toefl_header_mobileNav")}>
            {MENU.map((m) => (
              <Link
                key={m.labelKey}
                href={m.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[var(--en-ink-soft)] hover:bg-[#EDF2FB] hover:text-[var(--en-ink)]"
              >
                {t(m.labelKey)}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--en-line)] pt-3">
              {loggedIn && label && (
                <span className="truncate px-2 pb-1 text-xs font-semibold text-[var(--en-ink-soft)]">
                  {interpolate(t("toefl_header_loggedInAs"), { name: label })}
                </span>
              )}
              {canManage && (
                <Link
                  href="/admin/toefl"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2 text-[15px] font-bold text-[var(--en-ink)]"
                >
                  {t("admin")}
                </Link>
              )}
              <Link
                href={loggedIn ? "/toefl/mypage" : "/login?toefl=1"}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-[15px] font-bold text-[var(--en-ink)]"
              >
                {loggedIn ? t("toefl_navMyStudy") : t("login")}
              </Link>
              {loggedIn && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); toeflLogout(); }}
                  className="rounded-lg px-2 py-2 text-left text-[15px] font-semibold text-[var(--en-ink-soft)]"
                >
                  {t("logout")}
                </button>
              )}
              <Link
                href={loggedIn ? "/toefl/start?focus=full" : "/toefl/sample"}
                onClick={() => setOpen(false)}
                className="rounded-lg bg-[var(--en-gold)] px-4 py-2.5 text-center text-sm font-bold text-[var(--en-on-gold)]"
              >
                {loggedIn ? t("toefl_startTest") : t("toefl_tryFreeSample")}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
