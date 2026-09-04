"use client";

// SAT 관리자 대시보드 — 지금은 라우팅 인프라 단계라 문항 뱅크 현황만 보여준다.
// 검수 큐·세트 조립 등 실제 관리 화면은 다음 단계(관리자 화면)에서 채운다.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdminMe } from "@/lib/sat/admin-me";

interface Counts {
  total: number;
  rw: number;
  math: number;
  held: number; // gate_flags가 비어있지 않은(보류) 문항
}

export default function SatAdminDashboardPage() {
  const me = useAdminMe();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [{ count: total }, { count: rw }, { count: math }, { count: held }] = await Promise.all([
        supabase.from("sat_questions").select("*", { count: "exact", head: true }),
        supabase.from("sat_questions").select("*", { count: "exact", head: true }).eq("section", "rw"),
        supabase.from("sat_questions").select("*", { count: "exact", head: true }).eq("section", "math"),
        supabase.from("sat_questions").select("*", { count: "exact", head: true }).not("gate_flags", "eq", "{}"),
      ]);
      setCounts({ total: total ?? 0, rw: rw ?? 0, math: math ?? 0, held: held ?? 0 });
    }
    load();
  }, []);

  return (
    <div className="py-8">
      <h1 className="text-lg font-extrabold text-[var(--en-ink)]">대시보드</h1>
      <p className="mt-1 text-sm text-[var(--en-ink-soft)]">{me.name ?? me.id} 님, 환영합니다.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="전체 문항" value={counts?.total} />
        <StatCard label="Reading & Writing" value={counts?.rw} />
        <StatCard label="Math" value={counts?.math} />
        <StatCard label="검수 보류(Gate A)" value={counts?.held} />
      </div>

      <p className="mt-6 text-sm text-[var(--en-ink-soft)]">
        지금 보이는 문항은 전부 <code>verified=false</code> 상태입니다. 검수 큐 화면은 다음 단계에서 만듭니다.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-[var(--en-line)] bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--en-ink-soft)]">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-[var(--en-ink)]">{value ?? "…"}</p>
    </div>
  );
}
