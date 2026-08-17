"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { isStaff, canViewGrades } from "@/lib/roles";
import {
  loadMonthly,
  loadUnitWeakness,
  loadRiskList,
  loadUnpaidStudents,
  type MonthlyStat,
  type UnitWeakness,
  type RiskStudent,
} from "@/lib/admin-dashboard";
import type { Profile } from "@/lib/profile";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const cardClass = "rounded-2xl border border-[var(--border-c)] bg-white p-6";

function monthLabel(month: string): string {
  const d = new Date(month);
  return `${d.getFullYear()}.${d.getMonth() + 1}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [weakUnits, setWeakUnits] = useState<UnitWeakness[]>([]);
  const [riskList, setRiskList] = useState<RiskStudent[]>([]);
  const [unpaid, setUnpaid] = useState<Profile[]>([]);

  const loadAll = useCallback(async () => {
    const [m, w, r, u] = await Promise.all([
      loadMonthly(),
      loadUnitWeakness(10),
      loadRiskList(),
      loadUnpaidStudents(),
    ]);
    setMonthly(m);
    setWeakUnits(w);
    setRiskList(r);
    setUnpaid(u);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!isStaff(me?.role) || !canViewGrades(me?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      loadAll();
    }
    init();
  }, [router, loadAll]);

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">확인 중...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const monthlyData = monthly.map((m) => ({
    month: monthLabel(m.month),
    신규: m.new_students,
    출석률: m.avg_attendance_rate ?? undefined,
    제출정답률: m.avg_submission_correct_rate ?? undefined,
    정답률: m.avg_accuracy ?? undefined,
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">전체 대시보드</h1>
          <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
            ← 관리 화면으로
          </Link>
        </div>

        <div className="mt-8 space-y-8">
          <section className={cardClass}>
            <h2 className="text-lg font-medium text-[var(--foreground)]">월별 추이</h2>
            {monthlyData.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">아직 표시할 데이터가 없습니다.</p>
            ) : (
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-[var(--secondary)]">신규 가입자</p>
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <BarChart data={monthlyData}>
                        <CartesianGrid stroke="var(--border-c)" strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                        <Tooltip />
                        <Bar dataKey="신규" fill="var(--pink-dark)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--secondary)]">평균 출석률 · 제출정답률 · 정답률</p>
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer>
                      <LineChart data={monthlyData}>
                        <CartesianGrid stroke="var(--border-c)" strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="출석률" stroke="var(--mint-dark)" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="제출정답률" stroke="var(--pink-dark)" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="정답률" stroke="#5B87C9" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-medium text-[var(--foreground)]">단원 취약도 Top 10</h2>
            <p className="mt-1 text-xs text-[var(--secondary)]">시도 20건 미만인 단원은 제외됩니다. 콘텐츠 제작 우선순위 참고용.</p>
            {weakUnits.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">아직 조건을 만족하는 단원이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {weakUnits.map((u) => (
                  <li key={u.unit_id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm">
                    <div>
                      <span className="text-[var(--foreground)]">{u.unit_name}</span>
                      <span className="ml-2 text-xs text-[var(--secondary)]">
                        {u.curriculum_group} · {u.curriculum_detail}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--secondary)]">
                      정답률 {u.accuracy}% · 시도 {u.attempts}회
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-medium text-[var(--foreground)]">리스크 학생</h2>
            <p className="mt-1 text-xs text-[var(--secondary)]">리스크 점수 55점 이상인 학생만 표시됩니다.</p>
            {riskList.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">해당하는 학생이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {riskList.map((s) => (
                  <li key={s.student_id} className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm">
                    <div>
                      <Link href={`/admin/students/${s.student_id}`} className="font-medium text-[var(--foreground)] underline">
                        {s.name ?? s.email}
                      </Link>
                      <span className="ml-2 text-xs text-red-600">{s.main_cause}</span>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--secondary)]">리스크 {s.risk_score}점</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-medium text-[var(--foreground)]">미납 학생</h2>
            {unpaid.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">미납 학생이 없습니다.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {unpaid.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm">
                    <Link href={`/admin/students/${s.id}`} className="text-[var(--foreground)] underline">
                      {s.name ?? s.email}
                    </Link>
                    <span className="text-xs text-[var(--secondary)]">{s.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
