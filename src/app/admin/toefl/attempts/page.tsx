"use client";

// 응시 관리 — 개별 응시(attempt) 기록을 상태별로 보여준다.
// "학생 관리"(/admin/toefl/students)는 학생 한 명당 최근 요약(밴드 추이·라우팅)을 보여주는
// 화면이고, 여기는 그 반대 축이다 — 각 응시 건이 언제 시작해 지금 어떤 상태인지(진행 중 ·
// 제출됨 · 채점됨 · 폐기됨), 특히 오래 멈춰있는 in_progress 건을 관리자가 찾아낼 수 있어야 한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import type { ToeflAttemptMode, ToeflAttemptStatus } from "@/lib/toefl/types";

type AttemptRow = {
  id: string;
  studentName: string;
  studentEmail: string | null;
  formCode: string;
  formTitle: string;
  mode: ToeflAttemptMode;
  status: ToeflAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  overallBand: number | null;
};

const STATUS_LABEL: Record<ToeflAttemptStatus, string> = {
  in_progress: "진행 중",
  submitted: "제출됨",
  scored: "채점 완료",
  abandoned: "폐기됨",
};

const STATUS_STYLE: Record<ToeflAttemptStatus, string> = {
  in_progress: "bg-[var(--en-gold-soft)] text-[var(--en-gold-deep)]",
  submitted: "bg-[#EFF3FA] text-[var(--en-ink-soft)]",
  scored: "bg-[#E7F6EE] text-[#1C7A4B]",
  abandoned: "bg-[#F3F0EC] text-[#9AA7BF]",
};

// 실제 시험은 90분 안팎이다 — 이보다 훨씬 오래 in_progress로 남아있으면 학생이 중간에
// 나가버려 자동제출도 안 된 상태(브라우저 닫음 등)일 가능성이 높다. 관리자가 눈에 띄게 본다.
const STALE_HOURS = 4;

function hoursAgo(iso: string): number {
  return (Date.now() - Date.parse(iso)) / 3_600_000;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ToeflAttemptsPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AttemptRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<ToeflAttemptStatus | "all">("all");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: attempts } = await supabase
      .from("toefl_attempt")
      .select("id, user_id, form_id, mode, status, started_at, submitted_at, overall_band")
      .order("started_at", { ascending: false })
      .limit(300);

    const userIds = Array.from(new Set((attempts ?? []).map((a) => a.user_id)));
    const formIds = Array.from(new Set((attempts ?? []).map((a) => a.form_id)));
    const [{ data: profiles }, { data: forms }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null }[] }),
      formIds.length
        ? supabase.from("toefl_form").select("id, code, title").in("id", formIds)
        : Promise.resolve({ data: [] as { id: string; code: string; title: string }[] }),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const formById = new Map((forms ?? []).map((f) => [f.id, f]));

    setRows(
      (attempts ?? []).map((a) => {
        const p = profileById.get(a.user_id);
        const f = formById.get(a.form_id);
        return {
          id: a.id as string,
          studentName: (p?.name as string) || "이름 없음",
          studentEmail: (p?.email as string | null) ?? null,
          formCode: (f?.code as string) ?? "(삭제된 폼)",
          formTitle: (f?.title as string) ?? "",
          mode: a.mode as ToeflAttemptMode,
          status: a.status as ToeflAttemptStatus,
          startedAt: a.started_at as string,
          submittedAt: (a.submitted_at as string | null) ?? null,
          overallBand: (a.overall_band as number | null) ?? null,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter]
  );

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
      on
        ? "border-[var(--en-ink)] bg-[var(--en-ink)] text-white"
        : "border-[var(--en-line)] bg-white text-[var(--en-ink-soft)] hover:border-[var(--en-ink)] hover:text-[var(--en-ink)]"
    }`;

  return (
    <>
      <Topbar title="응시 관리" crumb="최근 300건 · 시작 시각 최신순" role={me.role} name={me.name} />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setStatusFilter("all")} className={chip(statusFilter === "all")}>
          전체 ({counts.all ?? 0})
        </button>
        {(Object.keys(STATUS_LABEL) as ToeflAttemptStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} className={chip(statusFilter === s)}>
            {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--en-line)] bg-white shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["학생", "폼", "모드", "상태", "시작", "제출", "밴드"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[var(--en-line)] bg-[#FAFBFE] px-3.5 py-2.5 text-left text-[11.5px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3.5 py-10 text-center text-[var(--en-ink-soft)]">
                      해당하는 응시 기록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => {
                    const stale = r.status === "in_progress" && hoursAgo(r.startedAt) > STALE_HOURS;
                    return (
                      <tr key={r.id} className="border-b border-[var(--en-line)] last:border-b-0 hover:bg-[#FAFBFE]">
                        <td className="px-3.5 py-3">
                          <span className="font-bold">{r.studentName}</span>
                          <span className="block text-[11px] font-medium text-[var(--en-ink-soft)]">
                            {r.studentEmail ?? "이메일 없음"}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="num font-bold">{r.formCode}</span>
                          <span className="block text-[11px] text-[var(--en-ink-soft)]">{r.formTitle}</span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-[var(--en-ink-soft)]">
                          {r.mode === "full" ? "풀 모의고사" : "영역 연습"}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <span className={`rounded-md px-2 py-[3px] text-[11px] font-bold ${STATUS_STYLE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                          {stale && (
                            <span
                              className="ml-1.5 text-[11px] font-bold text-[var(--risk-hi,#C1443D)]"
                              title={`${STALE_HOURS}시간 넘게 진행 중 — 중간에 이탈했을 가능성`}
                            >
                              ⚠ {STALE_HOURS}시간+
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--en-ink-soft)]">
                          {formatDateTime(r.startedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--en-ink-soft)]">
                          {formatDateTime(r.submittedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          {r.overallBand == null ? (
                            <span className="text-[var(--en-ink-soft)]">—</span>
                          ) : (
                            <span className="num text-sm font-bold">{r.overallBand.toFixed(1)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-xs text-[var(--en-ink-soft)]">
        풀 모의고사는 학생 1인당 폼 하나에 1회만 응시할 수 있습니다(폐기된 응시는 제외). 영역 연습은 반복 응시를
        막지 않습니다.
      </p>
    </>
  );
}
