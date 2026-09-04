"use client";

// SAT 관리자 공통 셸 — src/components/toefl/admin/AdminShell.tsx와 같은 구조.
// 지금은 라우팅 인프라 단계라 메뉴 1개(대시보드)만 있다. 문항 검수·세트 조립 등은
// 관리자 화면 단계에서 이 GROUPS에 추가한다 — 구조는 이미 확장 가능하게 짜둔다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_URL } from "@/lib/subject";

type Item = { label: string; icon: string; href?: string };
type Group = { title?: string; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ label: "대시보드", icon: "📊", href: "/admin/digital-sat" }] },
  {
    title: "문항 파이프라인",
    items: [
      { label: "문항 검수", icon: "📝" },
      { label: "세트 · 배포", icon: "📦" },
    ],
  },
];

export default function SatAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--en-paper)] text-[var(--en-ink)] lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-1 border-b border-[var(--en-line)] bg-white px-3.5 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <span className="flex items-baseline gap-2 px-2.5 pb-4 pt-1 text-[15px] font-extrabold tracking-[-.02em]">
          <a href={SITE_URL.math} title="PM EDU 메인으로" className="hover:text-[var(--en-ink-soft)]">
            PM EDU
          </a>
          <Link
            href="/sat"
            title="SAT 메인으로"
            className="num rounded-[5px] border-[1.5px] border-[var(--en-gold)] px-1.5 text-[11px] font-bold tracking-[.12em] text-[var(--en-gold-deep)] hover:bg-[var(--en-gold-soft)]"
          >
            SAT
          </Link>
        </span>
        <p className="px-2.5 pb-2 text-[11px] font-extrabold uppercase tracking-[.1em] text-[var(--en-ink-soft)]">
          디지털 SAT 어드민
        </p>

        <nav className="flex flex-col gap-0.5" aria-label="관리자 메뉴">
          {GROUPS.map((g, gi) => (
            <div key={g.title ?? `g${gi}`} className="flex flex-col gap-0.5">
              {g.title && (
                <span className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-[var(--en-ink-soft)]">
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
                      className={`${base} cursor-not-allowed text-[var(--en-ink-soft)] opacity-60`}
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
                      on ? "bg-[var(--en-ink)] text-white" : "text-[var(--en-ink-soft)] hover:bg-[var(--en-gold-soft)] hover:text-[var(--en-ink)]"
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
      </aside>

      <main className="min-w-0 px-7 pb-10">{children}</main>
    </div>
  );
}
