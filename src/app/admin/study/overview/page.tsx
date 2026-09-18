"use client";

// RUN_MATH_SITE.md 5-3: 현황 — canViewGrades(직원 전원). v_math_worksheet_overview(5-2)로
// 문제지별 통계, math_track_progress에서 "미통과 반복(2회 이상 시도, 아직 open)" 학생만 따로 뽑는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { canViewGrades } from "@/lib/roles";

interface WorksheetOverviewRow {
  worksheet_id: string;
  worksheet_title: string;
  students_attempted: number;
  students_passed: number;
  avg_accuracy: number | null;
}

interface StuckStudentRow {
  user_id: string;
  worksheet_id: string;
  attempts: number;
  best_accuracy: number | null;
  name: string | null;
  worksheet_title: string | null;
}

interface SuspectRow {
  problem_id: string;
  unit_name: string | null;
  curriculum_group: string | null;
  curriculum_detail: string | null;
  unit: string | null;
  worksheet_title: string | null;
  attempt_count: number;
  accuracy: number;
}

export default function AdminStudyOverviewPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [worksheets, setWorksheets] = useState<WorksheetOverviewRow[]>([]);
  const [stuck, setStuck] = useState<StuckStudentRow[]>([]);
  const [suspects, setSuspects] = useState<SuspectRow[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      const ok = canViewGrades(me?.role);
      setAllowed(ok);
      if (!ok) return;

      const [overviewResult, progressResult, suspectsResult] = await Promise.all([
        supabase
          .from("v_math_worksheet_overview")
          .select("worksheet_id, worksheet_title, students_attempted, students_passed, avg_accuracy")
          .gt("students_attempted", 0)
          .order("students_attempted", { ascending: false }),
        supabase
          .from("math_track_progress")
          .select("user_id, worksheet_id, attempts, best_accuracy, profiles(name), worksheets(title)")
          .eq("status", "open")
          .gte("attempts", 2),
        supabase
          .from("v_math_problem_suspects")
          .select("problem_id, unit_name, curriculum_group, curriculum_detail, unit, worksheet_title, attempt_count, accuracy")
          .order("accuracy", { ascending: true }),
      ]);

      setWorksheets((overviewResult.data as WorksheetOverviewRow[]) ?? []);
      setSuspects((suspectsResult.data as SuspectRow[]) ?? []);
      type JoinedRow = {
        user_id: string;
        worksheet_id: string;
        attempts: number;
        best_accuracy: number | null;
        profiles: { name: string | null } | null;
        worksheets: { title: string | null } | null;
      };
      setStuck(
        ((progressResult.data ?? []) as unknown as JoinedRow[]).map((r) => ({
          user_id: r.user_id,
          worksheet_id: r.worksheet_id,
          attempts: r.attempts,
          best_accuracy: r.best_accuracy,
          name: r.profiles?.name ?? null,
          worksheet_title: r.worksheets?.title ?? null,
        }))
      );
    }
    init();
  }, []);

  if (allowed === null) return <p className="p-6 text-sm text-[var(--secondary)]">확인 중...</p>;
  if (allowed === false) return <p className="p-6 text-sm text-[var(--foreground)]">이 화면을 볼 권한이 없습니다.</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium text-[var(--foreground)]">문제지별 현황</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-c)] text-left text-xs text-[var(--secondary)]">
                <th className="p-3">문제지</th>
                <th className="p-3">시도 학생</th>
                <th className="p-3">통과 학생</th>
                <th className="p-3">평균 정답률</th>
              </tr>
            </thead>
            <tbody>
              {worksheets.map((w) => (
                <tr key={w.worksheet_id} className="border-b border-[var(--border-c)] last:border-0">
                  <td className="p-3 text-[var(--foreground)]">{w.worksheet_title}</td>
                  <td className="p-3 text-[var(--secondary)]">{w.students_attempted}</td>
                  <td className="p-3 text-[var(--secondary)]">{w.students_passed}</td>
                  <td className="p-3 text-[var(--secondary)]">
                    {w.avg_accuracy !== null ? `${Math.round(w.avg_accuracy * 100)}%` : "-"}
                  </td>
                </tr>
              ))}
              {worksheets.length === 0 && (
                <tr>
                  <td className="p-3 text-[var(--secondary)]" colSpan={4}>
                    아직 시도한 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-[var(--foreground)]">미통과 반복 학생 (2회 이상 시도, 아직 통과 못함)</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-c)] text-left text-xs text-[var(--secondary)]">
                <th className="p-3">학생</th>
                <th className="p-3">문제지</th>
                <th className="p-3">시도 횟수</th>
                <th className="p-3">최고 정답률</th>
              </tr>
            </thead>
            <tbody>
              {stuck.map((s) => (
                <tr key={`${s.user_id}-${s.worksheet_id}`} className="border-b border-[var(--border-c)] last:border-0">
                  <td className="p-3 text-[var(--foreground)]">{s.name}</td>
                  <td className="p-3 text-[var(--secondary)]">{s.worksheet_title}</td>
                  <td className="p-3 text-[var(--secondary)]">{s.attempts}</td>
                  <td className="p-3 text-[var(--secondary)]">
                    {s.best_accuracy !== null ? `${Math.round(s.best_accuracy * 100)}%` : "-"}
                  </td>
                </tr>
              ))}
              {stuck.length === 0 && (
                <tr>
                  <td className="p-3 text-[var(--secondary)]" colSpan={4}>
                    없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-[var(--foreground)]">정답 의심 문항 (첫 시도 5회 이상, 정답률 20% 이하)</h2>
        <p className="mt-1 text-xs text-[var(--secondary)]">
          학생이 반복해서 틀리는 문항 — 문항 자체가 잘못됐을 가능성이 있습니다(정답/보기 오류 등).
        </p>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-c)] text-left text-xs text-[var(--secondary)]">
                <th className="p-3">단원</th>
                <th className="p-3">문제지</th>
                <th className="p-3">첫 시도 수</th>
                <th className="p-3">첫 시도 정답률</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {suspects.map((s) => (
                <tr key={s.problem_id} className="border-b border-[var(--border-c)] last:border-0">
                  <td className="p-3 text-[var(--foreground)]">{s.unit_name ?? s.unit ?? "-"}</td>
                  <td className="p-3 text-[var(--secondary)]">{s.worksheet_title ?? "-"}</td>
                  <td className="p-3 text-[var(--secondary)]">{s.attempt_count}</td>
                  <td className="p-3 text-red-600">{Math.round(s.accuracy * 100)}%</td>
                  <td className="p-3">
                    <Link
                      href={`/admin/problems?prob_curriculumGroup=${encodeURIComponent(s.curriculum_group ?? "")}&prob_curriculumDetail=${encodeURIComponent(s.curriculum_detail ?? "")}&prob_unit=${encodeURIComponent(s.unit ?? "")}`}
                      className="text-xs text-[var(--pink-dark)] underline"
                    >
                      해당 단원 문제은행 →
                    </Link>
                  </td>
                </tr>
              ))}
              {suspects.length === 0 && (
                <tr>
                  <td className="p-3 text-[var(--secondary)]" colSpan={5}>
                    아직 의심 문항이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
