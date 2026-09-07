"use client";

// 수학 학습 진행 구조 PG7: 관리자 대시보드 (RUN_MATH_PROGRESSION.md PG7 7-1/7-2).
// 기존 /admin 관례(화면별 개별 권한 체크, src/app/admin/problems/page.tsx 등)를 그대로
// 따른다 — TOEFL/SAT처럼 layout.tsx에서 한 번만 체크하는 방식으로 만들지 않는다(지시서 명시).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

interface StuckStudent {
  user_id: string;
  name: string | null;
  email: string | null;
  unit_name: string;
  consecutive_failed_sessions: number;
  last_practiced_at: string | null;
}

export default function MathProgressionAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [placementCount, setPlacementCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [stuckStudents, setStuckStudents] = useState<StuckStudent[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const [{ count: placements }, { count: mastered }, { data: stuck }] = await Promise.all([
        supabase.from("math_placements").select("user_id", { count: "exact", head: true }),
        supabase.from("math_unit_states").select("user_id", { count: "exact", head: true }).eq("status", "mastered"),
        supabase
          .from("v_math_stuck_students")
          .select("user_id, name, email, unit_name, consecutive_failed_sessions, last_practiced_at")
          .order("consecutive_failed_sessions", { ascending: false }),
      ]);
      setPlacementCount(placements ?? 0);
      setMasteredCount(mastered ?? 0);
      setStuckStudents((stuck ?? []) as StuckStudent[]);
      setLoading(false);
    }
    init();
  }, [router]);

  if (allowed === null) {
    return (
      <Shell>
        <p className="text-sm text-[var(--secondary)]">확인 중...</p>
      </Shell>
    );
  }
  if (allowed === false) {
    return (
      <Shell>
        <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          마이페이지로
        </Link>
      </Shell>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">수학 학습 진행 관리</h1>
          <div className="flex gap-3 text-sm">
            <Link href="/admin/math-progression/prereqs" className="text-[var(--secondary)] hover:text-[var(--foreground)]">
              선수관계 편집
            </Link>
            <Link href="/admin/math-progression/grants" className="text-[var(--secondary)] hover:text-[var(--foreground)]">
              권한 부여
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
                <p className="text-xs text-[var(--secondary)]">온보딩 완료 학생</p>
                <p className="mt-1 text-2xl font-medium text-[var(--foreground)]">{placementCount}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
                <p className="text-xs text-[var(--secondary)]">누적 숙달 단원 수</p>
                <p className="mt-1 text-2xl font-medium text-[var(--foreground)]">{masteredCount}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
                <p className="text-xs text-[var(--secondary)]">막힌 학생</p>
                <p className="mt-1 text-2xl font-medium text-[var(--foreground)]">{stuckStudents.length}</p>
              </div>
            </div>

            <section className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
              <h2 className="text-lg font-medium text-[var(--foreground)]">막힌 학생 (연속 3세션 이상 미달)</h2>
              {stuckStudents.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--secondary)]">지금은 막힌 학생이 없습니다.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stuckStudents.map((s, i) => (
                    <li key={i} className="flex items-center justify-between border-t border-[var(--border-c)] py-2 text-sm first:border-t-0 first:pt-0">
                      <div>
                        <p className="text-[var(--foreground)]">
                          {s.name ?? "-"} <span className="text-[var(--secondary)]">({s.email ?? "-"})</span>
                        </p>
                        <p className="text-xs text-[var(--secondary)]">{s.unit_name}</p>
                      </div>
                      <span className="text-red-600">{s.consecutive_failed_sessions}세션 연속 미달</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">{children}</main>
      <Footer />
    </>
  );
}
