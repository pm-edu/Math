"use client";

// RUN_MATH_SITE.md 5-3: 문제지 · 과정 — canManageMaterials(직원 전원). 문제지 자체 만들기는
// 기존 /admin/worksheets를 그대로 쓰고(레이아웃에 링크 있음), 이 화면은 과정(math_tracks) 현황과
// 추가 B(미매칭 문항 7건에 단원 지정) 두 가지만 새로 담당한다.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import { CURRICULUM_GROUPS, curriculumGroupLabel } from "@/lib/curriculum";
import type { DefectFinding } from "@/lib/math/problem-defects";

interface TrackRow {
  id: string;
  name: string;
  curriculum_group: string;
  worksheetCount: number;
}

interface UnassignedProblem {
  id: string;
  content_text: string | null;
  curriculum_group: string | null;
  curriculum_detail: string | null;
  unit: string | null;
}

interface UnitOption {
  id: string;
  curriculum_group: string;
  curriculum_detail: string;
  unit_name: string;
}

interface DefectResult {
  problemId: string;
  unit: string;
  snippet: string;
  findings: DefectFinding[];
}

export default function AdminStudyWorksheetsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedProblem[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [defectResults, setDefectResults] = useState<DefectResult[] | null>(null);
  const [defectTotal, setDefectTotal] = useState(0);
  const [scanningDefects, setScanningDefects] = useState(false);
  const [defectError, setDefectError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [tracksResult, countsResult, unassignedResult, unitsResult] = await Promise.all([
      supabase.from("math_tracks").select("id, name, curriculum_group").order("name"),
      supabase.from("math_track_worksheets").select("track_id"),
      supabase
        .from("problems")
        .select("id, content_text, curriculum_group, curriculum_detail, unit")
        .eq("subject", "math")
        .eq("verified", true)
        .is("unit_id", null)
        .limit(50),
      supabase.from("curriculum_units").select("id, curriculum_group, curriculum_detail, unit_name").order("sort_order"),
    ]);

    const counts = new Map<string, number>();
    for (const row of countsResult.data ?? []) {
      counts.set(row.track_id, (counts.get(row.track_id) ?? 0) + 1);
    }
    setTracks(((tracksResult.data ?? []) as Omit<TrackRow, "worksheetCount">[]).map((t) => ({ ...t, worksheetCount: counts.get(t.id) ?? 0 })));
    setUnassigned((unassignedResult.data as UnassignedProblem[]) ?? []);
    setUnits((unitsResult.data as UnitOption[]) ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      const ok = canManageMaterials(me?.role);
      setAllowed(ok);
      if (ok) await load();
    }
    init();
  }, []);

  async function saveUnitId(problemId: string) {
    const unitId = picked[problemId];
    if (!unitId) return;
    setSaving(problemId);
    const { error } = await createClient().from("problems").update({ unit_id: unitId }).eq("id", problemId);
    setSaving(null);
    if (error) {
      setMessage(`실패: ${error.message}`);
      return;
    }
    setMessage("단원을 지정했습니다.");
    setUnassigned((prev) => prev.filter((p) => p.id !== problemId));
  }

  async function runDefectScan() {
    setScanningDefects(true);
    setDefectError(null);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/study/problem-defects", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message ?? "스캔 실패");
      setDefectResults(data.results);
      setDefectTotal(data.total);
    } catch (e) {
      setDefectError(e instanceof Error ? e.message : "스캔 중 오류가 발생했습니다.");
    } finally {
      setScanningDefects(false);
    }
  }

  if (allowed === null) return <p className="p-6 text-sm text-[var(--secondary)]">확인 중...</p>;
  if (allowed === false) return <p className="p-6 text-sm text-[var(--foreground)]">이 화면을 볼 권한이 없습니다.</p>;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium text-[var(--foreground)]">과정</h2>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-c)] text-left text-xs text-[var(--secondary)]">
                <th className="p-3">이름</th>
                <th className="p-3">커리큘럼</th>
                <th className="p-3">문제지 수</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => (
                <tr key={t.id} className="border-b border-[var(--border-c)] last:border-0">
                  <td className="p-3 text-[var(--foreground)]">{t.name}</td>
                  <td className="p-3 text-[var(--secondary)]">{curriculumGroupLabel(t.curriculum_group)}</td>
                  <td className="p-3 text-[var(--secondary)]">{t.worksheetCount}</td>
                </tr>
              ))}
              {tracks.length === 0 && (
                <tr>
                  <td className="p-3 text-[var(--secondary)]" colSpan={3}>
                    아직 만들어진 과정이 없습니다. (scripts/seed-tracks.ts)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-[var(--foreground)]">
          단원 미지정 문항 {unassigned.length > 0 && `(${unassigned.length}건)`}
        </h2>
        <p className="mt-1 text-xs text-[var(--secondary)]">
          커리큘럼·과정·단원 텍스트가 curriculum_units와 정확히 일치하지 않아 자동 백필에서 빠진 문항입니다. 실제 단원을 직접 골라주세요.
        </p>
        {message && <p className="mt-2 text-xs text-[var(--mint-dark)]">{message}</p>}
        <div className="mt-2 space-y-2">
          {unassigned.map((p) => (
            <div key={p.id} className="rounded-xl border border-[var(--border-c)] bg-white p-3">
              <p className="text-xs text-[var(--secondary)]">
                {curriculumGroupLabel(p.curriculum_group)} · {p.curriculum_detail} · {p.unit}
              </p>
              <p className="mt-1 text-sm text-[var(--foreground)]">{(p.content_text ?? "").slice(0, 80)}</p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={picked[p.id] ?? ""}
                  onChange={(e) => setPicked((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="rounded-lg border border-[var(--border-c)] px-3 py-1.5 text-xs"
                >
                  <option value="">단원 선택</option>
                  {CURRICULUM_GROUPS.map((g) => (
                    <optgroup key={g.value} label={g.label}>
                      {units
                        .filter((u) => u.curriculum_group === g.value)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.curriculum_detail} / {u.unit_name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  onClick={() => saveUnitId(p.id)}
                  disabled={saving === p.id || !picked[p.id]}
                  className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-60"
                >
                  {saving === p.id ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          ))}
          {unassigned.length === 0 && <p className="text-sm text-[var(--secondary)]">단원 미지정 문항이 없습니다.</p>}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--foreground)]">
            결함 의심 {defectResults !== null && `(${defectResults.length}건 / 검사대상 ${defectTotal}건)`}
          </h2>
          <button
            onClick={runDefectScan}
            disabled={scanningDefects}
            className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {scanningDefects ? "스캔 중..." : "결함 스캔 실행"}
          </button>
        </div>
        <p className="mt-1 text-xs text-[var(--secondary)]">
          AI 생성 잔재(확인 필요/다시 계산 등), mcq 보기 결함, numeric 스펙 결함, 빈 본문, KaTeX 렌더 오류를 찾는다.
          수정은 안 하고 목록만 보여준다 — 고치는 건 /admin/problems에서.
        </p>
        {defectError && <p className="mt-2 text-xs text-red-600">{defectError}</p>}
        {defectResults !== null && (
          <div className="mt-2 space-y-2">
            {defectResults.length === 0 ? (
              <p className="text-sm text-[var(--secondary)]">결함 의심 문항이 없습니다.</p>
            ) : (
              defectResults.map((r) => (
                <div key={r.problemId} className="rounded-xl border border-[var(--border-c)] bg-white p-3">
                  <p className="text-xs text-[var(--secondary)]">
                    {r.unit} · {r.problemId}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground)]">{r.snippet}</p>
                  <ul className="mt-2 space-y-0.5">
                    {r.findings.map((f, i) => (
                      <li key={i} className="text-xs text-red-600">
                        [{f.type}] {f.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
