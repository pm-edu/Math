"use client";

// 수학 사이트(math.pmedu4u.com) 전용 관리 화면 공통 레이아웃(RUN_MATH_SITE.md 1-3).
// 권한 확인은 여기서 한 번(직원 전원 = isStaff, 세 화면 권한의 합집합) 하고, 통과한 경우에만
// 네비게이션 + 자식 화면을 그린다(/admin/math/layout.tsx와 같은 패턴). 실제 화면별 권한 차이
// (5단계: 학생 명단=canManageStudents, 문제지·과정=canManageMaterials, 현황=canViewGrades)는
// 각 페이지 자신이 한 번 더 좁혀서 확인한다 — 이 레이아웃은 "직원인가"만 본다.
// 진짜 차단은 각 화면이 쿼리하는 테이블의 RLS.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isStaff } from "@/lib/roles";

const NAV = [
  { href: "/admin/study/students", label: "반 · 학생" },
  { href: "/admin/study/worksheets", label: "문제지 · 과정" },
  { href: "/admin/study/overview", label: "현황" },
  { href: "/admin/study/grants", label: "접근권" },
] as const;

const EXISTING_SCREENS = [
  { href: "/admin/problems", label: "문제은행" },
  { href: "/admin/worksheets", label: "문제지 만들기" },
  { href: "/admin/classes", label: "반 관리" },
  { href: "/admin/attendance", label: "출결" },
] as const;

export default function AdminStudyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setAllowed(isStaff(data?.role));
    }
    init();
  }, [router]);

  if (allowed === null) return null; // 확인 전 깜빡임 방지
  if (allowed === false) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6">
        <p className="text-sm font-medium text-[var(--foreground)]">이 화면을 볼 권한이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/study" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
          ← 학습 화면으로
        </Link>
        <h1 className="mt-3 text-2xl font-medium text-[var(--foreground)]">수학 관리</h1>

        <nav className="mt-6 flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                pathname === item.href
                  ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                  : "border border-[var(--border-c)] bg-white text-[var(--foreground)] hover:bg-[var(--mint)]/40"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-2 flex flex-wrap gap-2">
          {EXISTING_SCREENS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-xs text-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {item.label} ↗
            </Link>
          ))}
        </div>

        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
