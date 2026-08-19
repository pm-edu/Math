"use client";

// TOEFL 관리자 공통 셸 — 좌측 사이드바 + 본문. docs/toefl-admin.html 의 .app / aside 구조.
//
// 목업은 한 페이지에서 JS로 뷰를 갈아끼우지만, 여기서는 실제 라우트로 나눈다
// (/admin/toefl, /forms, /students, /items, /audio). 그래야 새로고침·뒤로가기·링크 공유가
// 정상 동작하고, 각 화면이 자기 데이터만 불러온다.
//
// 아직 화면이 없는 메뉴(오디오 관리 일부·응시 관리·리포트·설정)는 href 없이 비활성으로 둔다 —
// 목업에 있다고 빈 화면을 만들어두면 눌러보고 실망하는 쪽이 더 나쁘다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_URL } from "@/lib/subject";

type Item = { label: string; icon: string; href?: string; count?: number };
type Group = { title?: string; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ label: "대시보드", icon: "📊", href: "/admin/toefl" }] },
  {
    title: "문항 파이프라인",
    items: [
      { label: "문항 생성", icon: "✨", href: "/admin/toefl/items" },
      { label: "문항 검수", icon: "📝" }, // B단계 — toefl_item 검수 상태 컬럼이 생겨야 가능
      { label: "세트 · 배포", icon: "📦", href: "/admin/toefl/forms" },
    ],
  },
  {
    title: "학습 운영",
    items: [
      { label: "학생 관리", icon: "👥", href: "/admin/toefl/students" },
      { label: "오디오(TTS) 관리", icon: "🎧", href: "/admin/toefl/audio" },
      { label: "응시 관리", icon: "🧪" },
    ],
  },
  { title: "리포트", items: [{ label: "반별 리포트", icon: "🏫" }, { label: "성적 추이", icon: "📈" }] },
  { title: "사이트", items: [{ label: "설정", icon: "⚙️" }] },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div data-theme="en" className="toefl-admin min-h-screen bg-[var(--en-paper)] text-[var(--en-ink)] lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-1 border-b border-[var(--en-line)] bg-white px-3.5 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        {/* 로고 두 조각은 각각 다른 곳으로 간다 — PM EDU는 회사 메인, TOEFL은 학생용 랜딩. */}
        <span className="flex items-baseline gap-2 px-2.5 pb-4 pt-1 text-[15px] font-extrabold tracking-[-.02em]">
          <a href={SITE_URL.math} title="PM EDU 메인으로" className="hover:text-[var(--en-ink-soft)]">
            PM EDU
          </a>
          <Link
            href="/toefl"
            title="TOEFL 메인으로"
            className="num rounded-[5px] border-[1.5px] border-[var(--en-gold)] px-1.5 text-[11px] font-bold tracking-[.12em] text-[var(--en-gold-deep)] hover:bg-[var(--en-gold-soft)]"
          >
            TOEFL
          </Link>
        </span>
        <p className="px-2.5 pb-2 text-[11px] font-extrabold uppercase tracking-[.1em] text-[var(--en-ink-soft)]">
          영어 · TOEFL 어드민
        </p>

        <nav className="flex flex-col gap-0.5" aria-label="관리자 메뉴">
          {GROUPS.map((g, gi) => (
            <div key={g.title ?? `g${gi}`} className="flex flex-col gap-0.5">
              {g.title && (
                <span className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[#9AA7BF]">
                  {g.title}
                </span>
              )}
              {g.items.map((it) => {
                const on = it.href === pathname;
                const base =
                  "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13.5px] font-semibold transition-colors";
                if (!it.href) {
                  return (
                    <span
                      key={it.label}
                      aria-disabled="true"
                      title="아직 준비 중인 화면입니다"
                      className={`${base} cursor-not-allowed text-[#B4BFD3]`}
                    >
                      <span aria-hidden="true">{it.icon}</span>
                      {it.label}
                      <span className="ml-auto text-[10px] font-bold">준비 중</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={it.label}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={`${base} ${
                      on ? "bg-[var(--en-ink)] text-white" : "text-[var(--en-ink-soft)] hover:bg-[#EDF2FB] hover:text-[var(--en-ink)]"
                    }`}
                  >
                    <span aria-hidden="true">{it.icon}</span>
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <p className="mt-auto hidden border-t border-[var(--en-line)] p-2.5 text-[11.5px] leading-relaxed text-[var(--en-ink-soft)] lg:block">
          교사 계정은 담당 반만 표시됩니다
        </p>
      </aside>

      <main className="min-w-0 px-7 pb-10">{children}</main>
    </div>
  );
}
