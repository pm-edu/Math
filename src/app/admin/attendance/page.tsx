"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ClassRow } from "@/lib/profile";
import { isStaff, canManageSite, canViewGrades, type Role } from "@/lib/roles";
import { loadClasses } from "@/lib/classes";
import {
  getOrCreateSession,
  loadAttendance,
  saveAttendance,
  ATTENDANCE_LABELS,
  type AttendanceStatus,
  type AttendanceRow,
} from "@/lib/attendance";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [date, setDate] = useState(today());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [rows, setRows] = useState<Map<string, AttendanceRow>>(new Map());
  const [saving, setSaving] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      setMyId(auth.user.id);
      setMyRole((me?.role ?? null) as Role | null);
      setAllowed(true);

      const [classList, { data: profileRows }] = await Promise.all([
        loadClasses(),
        supabase.from("profiles").select("id, name, email, role, created_at, class_id, grade_level, unpaid").order("name"),
      ]);
      const visible = canManageSite(me?.role)
        ? classList
        : classList.filter((c) => c.teacher_id === auth.user.id);
      setClasses(visible);
      setStudents((profileRows ?? []) as Profile[]);
      if (visible[0]) setClassId(visible[0].id);
    }
    init();
  }, [router]);

  const loadSession = useCallback(async () => {
    if (!classId) return;
    setLoadingSession(true);
    setSessionId(null);
    setRows(new Map());

    const cls = classes.find((c) => c.id === classId);
    const { id, error } = await getOrCreateSession(classId, date, cls?.teacher_id ?? null);
    if (error || !id) {
      setNotice(`수업 회차를 불러오지 못했습니다: ${error}`);
      setLoadingSession(false);
      return;
    }
    setSessionId(id);

    const existing = await loadAttendance(id);
    const roster = students.filter((s) => s.class_id === classId && s.role === "student");
    const next = new Map<string, AttendanceRow>();
    roster.forEach((s) => {
      next.set(
        s.id,
        existing.get(s.id) ?? { student_id: s.id, status: "present", late_minutes: 0, reason: "" }
      );
    });
    setRows(next);
    setLoadingSession(false);
  }, [classId, date, classes, students]);

  useEffect(() => {
    if (classId && students.length > 0) loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, date, students.length]);

  function updateRow(studentId: string, patch: Partial<AttendanceRow>) {
    setRows((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId);
      if (current) next.set(studentId, { ...current, ...patch });
      return next;
    });
  }

  async function handleSave() {
    if (!sessionId || !myId) return;
    setSaving(true);
    const { error } = await saveAttendance(sessionId, myId, Array.from(rows.values()));
    setSaving(false);
    if (error) {
      setNotice(`저장 실패: ${error}`);
      return;
    }
    setNotice("출결을 저장했습니다.");
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-16">
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

  const roster = Array.from(rows.values());

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">출결 체크</h1>
          <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
            ← 관리 화면으로
          </Link>
        </div>

        {notice && (
          <p className="mt-4 rounded-lg bg-[var(--mint)]/40 px-4 py-2 text-sm text-[var(--foreground)]">{notice}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm"
          >
            {classes.length === 0 && <option value="">담당 반 없음</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm"
          />
        </div>

        {loadingSession ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : roster.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">이 반에 배정된 학생이 없습니다.</p>
        ) : (
          <>
            <ul className="mt-6 space-y-2">
              {roster.map((row) => {
                const student = students.find((s) => s.id === row.student_id);
                return (
                  <li
                    key={row.student_id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-white p-4"
                  >
                    <span className="min-w-[80px] text-sm font-medium text-[var(--foreground)]">
                      {student?.name ?? student?.email ?? "-"}
                    </span>
                    <select
                      value={row.status}
                      onChange={(e) => updateRow(row.student_id, { status: e.target.value as AttendanceStatus })}
                      className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1.5 text-sm"
                    >
                      {Object.entries(ATTENDANCE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {row.status === "late" && (
                      <input
                        type="number"
                        min={0}
                        placeholder="지각 분"
                        value={row.late_minutes || ""}
                        onChange={(e) => updateRow(row.student_id, { late_minutes: Number(e.target.value) })}
                        className="w-24 rounded-lg border border-[var(--border-c)] bg-white px-2 py-1.5 text-sm"
                      />
                    )}
                    {(row.status === "absent_excused" || row.status === "absent_unexcused") && (
                      <input
                        type="text"
                        placeholder="사유 (선택)"
                        value={row.reason}
                        onChange={(e) => updateRow(row.student_id, { reason: e.target.value })}
                        className="min-w-[160px] flex-1 rounded-lg border border-[var(--border-c)] bg-white px-2 py-1.5 text-sm"
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-6 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
            >
              {saving ? "저장 중..." : "출결 저장"}
            </button>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
