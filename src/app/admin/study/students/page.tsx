"use client";

// RUN_MATH_SITE.md 5-3: 반 · 학생 — canManageStudents(교사 이상). 기존 화면(/admin/classes 등)을
// 다시 만들지 않고, 이 화면은 "과정 배정"만 새로 담당한다(4단계 assign_track() 재사용).

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManageStudents } from "@/lib/roles";

interface StudentRow {
  id: string;
  name: string | null;
  email: string | null;
  class_id: string | null;
  track_id: string | null;
  curriculum_group: string | null;
}

interface TrackOption {
  id: string;
  name: string;
}

export default function AdminStudyStudentsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTrack, setTargetTrack] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const [studentsResult, tracksResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, class_id, track_id, curriculum_group")
        .eq("role", "student")
        .order("name"),
      supabase.from("math_tracks").select("id, name").order("name"),
    ]);
    setStudents((studentsResult.data as StudentRow[]) ?? []);
    setTracks((tracksResult.data as TrackOption[]) ?? []);
  }

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      const ok = canManageStudents(me?.role);
      setAllowed(ok);
      if (ok) await load();
    }
    init();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!targetTrack || selected.size === 0) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    let ok = 0;
    const failed: string[] = [];
    for (const studentId of selected) {
      const { error: rpcErr } = await supabase.rpc("assign_track", { target_user_id: studentId, new_track_id: targetTrack });
      if (rpcErr) failed.push(rpcErr.message);
      else ok++;
    }
    setSaving(false);
    setMessage(`${ok}명에게 과정을 배정했습니다.${failed.length > 0 ? ` (실패 ${failed.length}건)` : ""}`);
    if (failed.length > 0) setError(failed[0]);
    setSelected(new Set());
    await load();
  }

  if (allowed === null) return <p className="p-6 text-sm text-[var(--secondary)]">확인 중...</p>;
  if (allowed === false) return <p className="p-6 text-sm text-[var(--foreground)]">이 화면을 볼 권한이 없습니다.</p>;

  const trackName = (id: string | null) => tracks.find((t) => t.id === id)?.name ?? "미배정";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-c)] bg-white p-4">
        <select
          value={targetTrack}
          onChange={(e) => setTargetTrack(e.target.value)}
          className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm"
        >
          <option value="">과정 선택</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={saving || !targetTrack || selected.size === 0}
          className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "배정 중..." : `선택한 ${selected.size}명에게 과정 배정`}
        </button>
        {message && <span className="text-sm text-[var(--mint-dark)]">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-c)] text-left text-xs text-[var(--secondary)]">
              <th className="w-10 p-3"></th>
              <th className="p-3">이름</th>
              <th className="p-3">이메일</th>
              <th className="p-3">과정</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const hasChosenCurriculum = !!s.curriculum_group;
              return (
                <tr key={s.id} className="border-b border-[var(--border-c)] last:border-0">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      disabled={!hasChosenCurriculum}
                      title={hasChosenCurriculum ? undefined : "학생이 아직 과정(커리큘럼)을 선택하지 않아 배정할 수 없어요."}
                      className="h-4 w-4 accent-[var(--pink)] disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                  <td className="p-3 text-[var(--foreground)]">{s.name}</td>
                  <td className="p-3 text-[var(--secondary)]">{s.email}</td>
                  <td className="p-3 text-[var(--secondary)]">
                    {hasChosenCurriculum ? (
                      trackName(s.track_id)
                    ) : (
                      <span className="text-amber-600">과정 미선택(학생 대기)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
