"use client";

// 수학 전용 관리자 공통 셸 — 좌측 사이드바 + 본문. TOEFL 어드민 셸(src/components/toefl/admin/AdminShell.tsx)과
// 같은 패턴. 화면은 새로 안 만들고 기존 /admin/* 화면들을 그대로 링크만 정리한다 — "학생에게
// 자료 보내기 등 관리를 간단히" 요청에 맞춰, 수학과 무관한 항목(SAT·영어단어·TOEFL)을 빼고
// 흩어져 있던 메뉴를 역할별로 묶어 보여준다.
//
// 링크 대상 페이지들은 이미 subject 쿠키(도메인 기준, pmedu4u.com=math)로 수학 콘텐츠만
// 보여주므로 이 셸 자체는 필터링을 하지 않는다 — 순수하게 내비게이션만 정리하는 계층이다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminMe } from "@/lib/math/admin-me";
import { canManageSite, canManageMaterials, canViewGrades } from "@/lib/roles";

type Item = { label: string; icon: string; href: string; show: boolean };
type Group = { title?: string; items: Item[] };

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const me = useAdminMe();
  const canSite = canManageSite(me.role);
  const canMaterials = canManageMaterials(me.role);
  const canGrades = canViewGrades(me.role);

  const GROUPS: Group[] = [
    { items: [{ label: "대시보드", icon: "📊", href: "/admin/math", show: true }] },
    {
      title: "자료 관리",
      items: [
        { label: "문제은행", icon: "📚", href: "/admin/problems", show: canMaterials },
        { label: "문제지 · 배포", icon: "📄", href: "/admin/worksheets", show: canMaterials },
        { label: "자동 출제", icon: "🧩", href: "/admin/assemble", show: canMaterials },
        { label: "문제 추출", icon: "🔍", href: "/admin/extract", show: canMaterials },
        { label: "AI 문제 생성", icon: "✨", href: "/admin/generate", show: canMaterials },
      ],
    },
    {
      title: "강좌 운영",
      items: [
        { label: "강좌 관리", icon: "🎓", href: "/admin/courses", show: canSite },
        { label: "강의 등록", icon: "🎬", href: "/admin/lessons", show: canSite },
        { label: "수강 신청", icon: "🧾", href: "/admin/enrollments", show: canSite },
        { label: "분류 관리", icon: "🏷️", href: "/admin/categories", show: canSite },
      ],
    },
    {
      title: "학생 · 발송",
      items: [
        { label: "학생 · 역할 관리", icon: "👥", href: "/admin", show: true },
        { label: "반 관리 · 리포트", icon: "🏫", href: "/admin/classes", show: canGrades },
        { label: "출결 체크", icon: "✅", href: "/admin/attendance", show: canGrades },
        { label: "메일 · 자료 보내기", icon: "📧", href: "/admin/mail", show: canSite },
      ],
    },
    {
      title: "진행 구조",
      items: [
        { label: "학습 진행 대시보드", icon: "🧭", href: "/admin/math-progression", show: canGrades },
        { label: "선수관계 편집", icon: "🔗", href: "/admin/math-progression/prereqs", show: canSite },
        { label: "수강권 부여", icon: "🎟️", href: "/admin/math-progression/grants", show: canSite },
      ],
    },
    {
      title: "사이트",
      items: [
        { label: "전체 대시보드", icon: "📈", href: "/admin/dashboard", show: canGrades },
        { label: "설정", icon: "⚙️", href: "/admin/settings", show: canSite },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-en-paper text-en-ink lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="flex flex-col gap-1 border-b border-en-line bg-white px-3.5 py-5 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <span className="flex items-baseline gap-2 px-2.5 pb-4 pt-1 text-[15px] font-extrabold tracking-[-.02em]">
          <Link href="/" title="PM EDU 메인으로" className="hover:text-en-ink-soft">
            PM EDU
          </Link>
          <span className="rounded-[5px] border-[1.5px] border-en-gold px-1.5 text-[11px] font-bold tracking-[.12em] text-en-gold-deep">
            수학
          </span>
        </span>
        <p className="px-2.5 pb-2 text-[11px] font-extrabold uppercase tracking-[.1em] text-en-ink-soft">
          수학 어드민
        </p>

        <nav className="flex flex-col gap-0.5" aria-label="관리자 메뉴">
          {GROUPS.map((g, gi) => {
            const visible = g.items.filter((it) => it.show);
            if (visible.length === 0) return null;
            return (
              <div key={g.title ?? `g${gi}`} className="flex flex-col gap-0.5">
                {g.title && (
                  <span className="px-2.5 pb-1 pt-3.5 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-en-ink-soft/70">
                    {g.title}
                  </span>
                )}
                {visible.map((it) => {
                  const on = it.href === pathname;
                  return (
                    <Link
                      key={it.label}
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13.5px] font-semibold transition-colors ${
                        on ? "bg-en-ink text-white" : "text-en-ink-soft hover:bg-en-gold-soft/40 hover:text-en-ink"
                      }`}
                    >
                      <span aria-hidden="true">{it.icon}</span>
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <p className="mt-auto hidden border-t border-en-line p-2.5 text-[11.5px] leading-relaxed text-en-ink-soft lg:block">
          {me.name ?? "관리자"} · {me.role}
        </p>
      </aside>

      <main className="min-w-0 px-7 pb-10 pt-7">{children}</main>
    </div>
  );
}
