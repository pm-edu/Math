"use client";

// 학생 관리. docs/toefl-admin.html 의 VIEW 5.
//
// A단계라 "리스크 점수" 열은 넣지 않았다 — 계산식(미접속 일수 · 밴드 하락폭의 가중치)이
// 아직 정해지지 않았고, 근거 없는 숫자를 관리자에게 보여주면 그걸 믿고 학생을 판단하게 된다.
// 대신 리스크의 재료가 되는 값(마지막 활동 · 밴드 증감 · 라우팅)을 그대로 보여주고,
// 기본 정렬을 "오래 안 들어온 순"으로 둬서 같은 목적을 지금 데이터로 달성한다.
//
// 벌크 액션(세트 배포 · 메일 · 학부모 링크)도 배포 테이블이 생긴 뒤에 붙인다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { SECTION_ORDER, SECTION_TAG, routeLabel } from "@/lib/toefl/admin-labels";
import type { ToeflSection } from "@/lib/toefl/types";

const MAX_BAND = 6;

type ClassRow = { id: string; name: string };
type Student = {
  id: string;
  name: string;
  email: string | null;
  classId: string | null;
  attempts: number;
  band: number | null;
  delta: number | null;
  lastActivity: string | null; // ISO
  latestAttemptId: string | null;
  // 3차 화면 검토(2026-08-27) [C]-4: "리포트" 버튼이 항상 최신 것 하나만 가리켜서 지난 응시를
  // 못 골랐다는 지적 — 응시 이력 전체(최신순)를 들고 있다가 2개 이상이면 드롭다운으로 고르게 한다.
  attemptHistory: { id: string; submittedAt: string }[];
  sectionBands: Partial<Record<ToeflSection, number>>;
  routes: Partial<Record<ToeflSection, string>>;
};

type SortKey = "inactive" | "band" | "recent";

// 화면 검토(2026-08-27) [B]: 7일 이상 활동이 없으면(또는 응시 자체가 없으면) "메일 발송"
// 액션을 보여준다 — 정확한 리스크 점수 공식은 아직 안 정해졌지만(위 주석 참고), "너무 오래
// 안 들어온 학생에게 먼저 연락한다"는 목적은 지금 데이터(마지막 활동일)만으로 충분하다.
const INACTIVE_DAYS = 7;

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

function daysAgoLabel(iso: string | null): string {
  const days = daysAgo(iso);
  if (days === null) return "응시 없음";
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

export default function ToeflStudentsPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("inactive");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: profiles }, { data: classRows }, { data: attempts }] = await Promise.all([
      supabase.from("profiles").select("id, name, email, class_id").eq("role", "student"),
      supabase.from("classes").select("id, name").order("name"),
      supabase
        .from("toefl_attempt")
        .select("id, user_id, submitted_at, overall_band")
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false }),
    ]);

    // 학생별 응시 이력(최신순). 최근 2건으로 밴드 증감을 낸다.
    const byUser = new Map<string, { id: string; submitted_at: string; overall_band: number | null }[]>();
    for (const a of attempts ?? []) {
      if (!a.submitted_at) continue;
      const list = byUser.get(a.user_id) ?? [];
      list.push({ id: a.id, submitted_at: a.submitted_at, overall_band: a.overall_band });
      byUser.set(a.user_id, list);
    }

    // 영역별 밴드·라우팅은 "각 학생의 가장 최근 응시" 것만 가져온다.
    const latestIds = Array.from(byUser.values()).map((l) => l[0]?.id).filter(Boolean) as string[];
    const { data: sections } = latestIds.length
      ? await supabase.from("toefl_section_attempt").select("attempt_id, section, band, routed_to").in("attempt_id", latestIds)
      : { data: [] };
    const sectionsByAttempt = new Map<string, { section: ToeflSection; band: number | null; routed_to: string | null }[]>();
    for (const s of sections ?? []) {
      const list = sectionsByAttempt.get(s.attempt_id) ?? [];
      list.push({ section: s.section as ToeflSection, band: s.band, routed_to: s.routed_to });
      sectionsByAttempt.set(s.attempt_id, list);
    }

    setClasses((classRows ?? []) as ClassRow[]);
    setStudents(
      (profiles ?? []).map((p) => {
        const history = byUser.get(p.id as string) ?? [];
        const latest = history[0];
        const prev = history[1];
        const rows = latest ? (sectionsByAttempt.get(latest.id) ?? []) : [];
        const sectionBands: Student["sectionBands"] = {};
        const routes: Student["routes"] = {};
        for (const r of rows) {
          if (r.band != null) sectionBands[r.section] = r.band;
          if (r.routed_to) routes[r.section] = r.routed_to;
        }
        return {
          id: p.id as string,
          name: (p.name as string) ?? "이름 없음",
          email: (p.email as string) ?? null,
          classId: (p.class_id as string) ?? null,
          attempts: history.length,
          band: latest?.overall_band ?? null,
          delta: latest?.overall_band != null && prev?.overall_band != null ? latest.overall_band - prev.overall_band : null,
          lastActivity: latest?.submitted_at ?? null,
          latestAttemptId: latest?.id ?? null,
          attemptHistory: history.map((h) => ({ id: h.id, submittedAt: h.submitted_at })),
          sectionBands,
          routes,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const filtered = classFilter ? students.filter((s) => s.classId === classFilter) : students;
    const sorted = [...filtered];
    if (sort === "band") {
      sorted.sort((a, b) => (b.band ?? -1) - (a.band ?? -1));
    } else if (sort === "recent") {
      sorted.sort((a, b) => Date.parse(b.lastActivity ?? "0") - Date.parse(a.lastActivity ?? "0"));
    } else {
      // 오래 안 들어온 순 — 응시가 아예 없는 학생을 맨 위로.
      sorted.sort((a, b) => Date.parse(a.lastActivity ?? "0") - Date.parse(b.lastActivity ?? "0"));
    }
    return sorted;
  }, [students, classFilter, sort]);

  const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
      on
        ? "border-[var(--en-ink)] bg-[var(--en-ink)] text-white"
        : "border-[var(--en-line)] bg-white text-[var(--en-ink-soft)] hover:border-[var(--en-ink)] hover:text-[var(--en-ink)]"
    }`;

  return (
    <>
      <Topbar title="학생 관리" crumb="오래 안 들어온 순 기본 정렬" role={me.role} name={me.name} />

      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setClassFilter(null)} className={chip(classFilter === null)}>
          전체 ({students.length})
        </button>
        {classes.map((c) => {
          const n = students.filter((s) => s.classId === c.id).length;
          return (
            <button key={c.id} type="button" onClick={() => setClassFilter(c.id)} className={chip(classFilter === c.id)}>
              {c.name} ({n})
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-xs text-[var(--en-ink-soft)]">
          정렬:
          <button type="button" onClick={() => setSort("inactive")} className={chip(sort === "inactive")}>
            미접속순
          </button>
          <button type="button" onClick={() => setSort("band")} className={chip(sort === "band")}>
            밴드순
          </button>
          <button type="button" onClick={() => setSort("recent")} className={chip(sort === "recent")}>
            활동순
          </button>
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--en-line)] bg-white shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["학생", "반", "최근 밴드", "영역별", "Stage 2 라우팅", "마지막 활동", "액션"].map((h) => (
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
                      해당하는 학생이 없습니다.
                    </td>
                  </tr>
                ) : (
                  visible.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--en-line)] last:border-b-0 hover:bg-[#FAFBFE]">
                      <td className="px-3.5 py-3">
                        <span className="font-bold">{s.name}</span>
                        <span className="block text-[11px] font-medium text-[var(--en-ink-soft)]">
                          {s.email ?? "이메일 없음"} · 응시 {s.attempts}회
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-[var(--en-ink-soft)]">
                        {s.classId ? (classNameById.get(s.classId) ?? "알 수 없음") : "미배정"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {s.band == null ? (
                          <span className="text-[var(--en-ink-soft)]">—</span>
                        ) : (
                          <>
                            <span className="num text-sm font-bold">{s.band.toFixed(1)}</span>{" "}
                            {s.delta != null && s.delta !== 0 && (
                              <span className={`text-[11px] font-bold ${s.delta > 0 ? "text-[var(--risk-lo)]" : "text-[var(--risk-hi)]"}`}>
                                {s.delta > 0 ? "▲" : "▼"}
                                {Math.abs(s.delta).toFixed(1)}
                              </span>
                            )}
                            {s.delta === 0 && <span className="text-[11px] font-bold text-[var(--en-ink-soft)]">—</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="flex min-w-[110px] gap-[3px]" title="Reading · Listening · Speaking · Writing">
                          {SECTION_ORDER.map((sec) => {
                            const b = s.sectionBands[sec];
                            return (
                              <span key={sec} className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#EFF3FA]">
                                {b != null && (
                                  <span
                                    className="block h-full rounded-[3px]"
                                    style={{ width: `${(b / MAX_BAND) * 100}%`, background: SECTION_TAG[sec].color }}
                                  />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3">
                        {Object.keys(s.routes).length === 0 ? (
                          <span className="text-[var(--en-ink-soft)]">—</span>
                        ) : (
                          <span className="inline-flex gap-1">
                            {SECTION_ORDER.filter((sec) => s.routes[sec]).map((sec) => {
                              const hard = s.routes[sec] === "hard";
                              return (
                                <b
                                  key={sec}
                                  className={`num rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold ${
                                    hard ? "bg-[var(--en-gold-soft)] text-[var(--en-gold-deep)]" : "bg-[#EFF3FA] text-[var(--en-ink-soft)]"
                                  }`}
                                >
                                  {SECTION_TAG[sec].short} {routeLabel(s.routes[sec] ?? null)}
                                </b>
                              );
                            })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--en-ink-soft)]">
                        {daysAgoLabel(s.lastActivity)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <Link href={`/admin/students/${s.id}`} className="font-bold text-[var(--en-ink)] hover:underline">
                            상세
                          </Link>
                          <Link href={`/admin/toefl/attempts?student=${s.id}`} className="font-bold text-[var(--en-ink)] hover:underline">
                            응시 기록
                          </Link>
                          {s.latestAttemptId && s.band != null && (
                            <a
                              href={`/toefl/report/${s.latestAttemptId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-[var(--en-gold-deep)] hover:underline"
                            >
                              최신 리포트
                            </a>
                          )}
                          {s.attemptHistory.length >= 2 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) window.open(`/toefl/report/${e.target.value}`, "_blank", "noreferrer");
                                e.target.value = "";
                              }}
                              className="rounded-md border border-[var(--en-line)] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[var(--en-ink-soft)]"
                            >
                              <option value="" disabled>
                                지난 리포트 ({s.attemptHistory.length})
                              </option>
                              {s.attemptHistory.map((a, i) => (
                                <option key={a.id} value={a.id}>
                                  {i === 0 ? "최신 · " : ""}
                                  {new Date(a.submittedAt).toLocaleDateString("ko-KR")}
                                </option>
                              ))}
                            </select>
                          )}
                          {(daysAgo(s.lastActivity) === null || (daysAgo(s.lastActivity) ?? 0) >= INACTIVE_DAYS) && (
                            <Link
                              href={`/admin/mail?student=${s.id}`}
                              className="font-bold text-[var(--risk-hi,#C1443D)] hover:underline"
                            >
                              메일 발송
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-2.5 text-xs text-[var(--en-ink-soft)]">
        라우팅의 &quot;하급&quot;은 Stage 2에서 밴드 4.0 상한이 걸렸다는 뜻입니다. 하급 라우팅이 반복되는 학생이 우선
        개입 대상입니다. 리스크 점수와 벌크 액션(세트 배포 · 메일 · 학부모 링크)은 계산식과 배포 테이블이 정해지면
        이 화면에 추가됩니다.
      </p>
    </>
  );
}
