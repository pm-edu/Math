"use client";

// 수학 어드민 홈. "자료 보내기 등 관리를 간단히" 요청에 맞춰, 가장 자주 쓰는 두 작업
// (문제지 배포·메일 발송)을 큰 카드로 맨 위에 두고, 나머지는 사이드바로 뺐다.
// 숫자는 지금 실제로 쉽게 셀 수 있는 것만 보여준다(TOEFL 대시보드와 같은 원칙 — 지어내지 않음).

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAdminMe } from "@/lib/math/admin-me";

type Stats = { students: number; pendingEnrollments: number; newContacts: number };

export default function MathAdminHome() {
  const me = useAdminMe();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [{ count: students }, { count: pending }, { count: contacts }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student"),
        supabase.from("purchases").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("contacts").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        students: students ?? 0,
        pendingEnrollments: pending ?? 0,
        newContacts: contacts ?? 0,
      });
    }
    load();
  }, []);

  return (
    <div className="max-w-4xl">
      <p className="text-sm font-semibold text-en-gold-deep">수학 어드민</p>
      <h1 className="mt-1 text-2xl font-bold text-en-ink">
        {me.name ? `${me.name}님, 안녕하세요.` : "안녕하세요."}
      </h1>
      <p className="mt-2 text-sm text-en-ink-soft">가장 자주 쓰는 작업 두 가지를 위에 뒀습니다.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/mail"
          className="rounded-2xl border border-en-line bg-en-card p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="text-2xl">📧</span>
          <p className="mt-3 text-lg font-bold text-en-ink">메일 · 자료 보내기</p>
          <p className="mt-1 text-sm text-en-ink-soft">학생·이메일 구독자에게 공지나 문제지 PDF를 보냅니다.</p>
        </Link>
        <Link
          href="/admin/worksheets"
          className="rounded-2xl border border-en-line bg-en-card p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <span className="text-2xl">📄</span>
          <p className="mt-3 text-lg font-bold text-en-ink">문제지 만들기 · 배포</p>
          <p className="mt-1 text-sm text-en-ink-soft">문제를 골라 문제지를 만들고 학생에게 배포합니다.</p>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="전체 학생" value={stats?.students} />
        <StatCard label="입금 대기 수강신청" value={stats?.pendingEnrollments} tone={stats && stats.pendingEnrollments > 0 ? "alert" : undefined} />
        <StatCard label="문의 누적" value={stats?.newContacts} />
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | undefined; tone?: "alert" }) {
  return (
    <div className="rounded-xl border border-en-line bg-en-card p-4">
      <p className="text-xs font-semibold text-en-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "alert" ? "text-red-600" : "text-en-ink"}`}>
        {value === undefined ? "…" : value.toLocaleString()}
      </p>
    </div>
  );
}
