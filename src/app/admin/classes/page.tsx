"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ClassRow } from "@/lib/profile";
import { isStaff, canManageSite, canViewGrades, type Role } from "@/lib/roles";
import { loadClasses, createClass, deleteClass, setClassTeacher, setStudentClass, loadStudentReports } from "@/lib/classes";
import type { StudentReport } from "@/lib/classes";
import { loadStudentCareStats, type StudentCareStats } from "@/lib/students";

export default function ClassesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [myClassId, setMyClassId] = useState<string | null>(null);
  const [manage, setManage] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<Map<string, StudentReport>>(new Map());
  const [careStats, setCareStats] = useState<StudentCareStats>({
    consultationsThisMonth: 0,
    goalsTotal: 0,
    goalsAchieved: 0,
  });
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    const supabase = createClient();
    const [classList, { data: profileRows }] = await Promise.all([
      loadClasses(),
      supabase.from("profiles").select("id, name, email, role, created_at, class_id, grade_level").order("name"),
    ]);
    setClasses(classList);
    const allProfiles = (profileRows ?? []) as Profile[];
    setProfiles(allProfiles);
    const studentIds = allProfiles.filter((p) => p.role === "student").map((p) => p.id);
    setReports(await loadStudentReports(studentIds));
    setCareStats(await loadStudentCareStats(studentIds));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role, class_id").eq("id", auth.user.id).maybeSingle();
      if (!isStaff(me?.role) || !canViewGrades(me?.role)) { setAllowed(false); return; }
      setMyId(auth.user.id);
      setMyRole((me?.role ?? null) as Role | null);
      setMyClassId(me?.class_id ?? null);
      setManage(canManageSite(me?.role));
      setAllowed(true);
      loadAll();
    }
    init();
  }, [router, loadAll]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await createClass(name);
    if (error) { setNotice(`반 생성 실패: ${error}`); return; }
    setNewName("");
    loadAll();
  }

  async function handleDelete(cls: ClassRow) {
    if (!confirm(`"${cls.name}" 반을 삭제할까요? 소속 학생은 미배정 상태가 됩니다.`)) return;
    const { error } = await deleteClass(cls.id);
    if (error) { setNotice(`삭제 실패: ${error}`); return; }
    loadAll();
  }

  async function handleTeacherChange(cls: ClassRow, teacherId: string) {
    const { error } = await setClassTeacher(cls.id, teacherId || null);
    if (error) { setNotice(`담당교사 지정 실패: ${error}`); return; }
    loadAll();
  }

  async function handleAddStudent(classId: string) {
    const studentId = addTarget[classId];
    if (!studentId) return;
    const { error } = await setStudentClass(studentId, classId);
    if (error) { setNotice(`배정 실패: ${error}`); return; }
    setAddTarget((prev) => ({ ...prev, [classId]: "" }));
    loadAll();
  }

  async function handleRemoveStudent(studentId: string) {
    const { error } = await setStudentClass(studentId, null);
    if (error) { setNotice(`반 해제 실패: ${error}`); return; }
    loadAll();
  }

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

  const teacherOptions = profiles.filter((p) => isStaff(p.role));
  const students = profiles.filter((p) => p.role === "student");
  const unassignedStudents = students.filter((s) => !s.class_id);
  const visibleClasses = manage
    ? classes
    : myRole === "teacher"
    ? classes.filter((c) => c.teacher_id === myId)
    : classes.filter((c) => c.id === myClassId);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">반 관리 · 리포트</h1>
          <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
            ← 관리 화면으로
          </Link>
        </div>

        {notice && (
          <p className="mt-4 rounded-lg bg-[var(--mint)]/40 px-4 py-2 text-sm text-[var(--foreground)]">{notice}</p>
        )}

        {manage && students.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-medium text-[var(--foreground)]">사이트 전체 현황</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">전체 학생</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{students.length}명</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">최근 7일 활동 학생</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--mint-dark)]">
                  {students.filter((s) => (reports.get(s.id)?.activityLast7d ?? 0) > 0).length}명
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">평균 단어 마스터리</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                  {Math.round(
                    (students.reduce((sum, s) => sum + (reports.get(s.id)?.wordAvgMastery ?? 0), 0) /
                      students.length) *
                      100
                  )}
                  %
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">문제지 제출률</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                  {(() => {
                    const assigned = students.reduce((sum, s) => sum + (reports.get(s.id)?.worksheetsAssigned ?? 0), 0);
                    const submitted = students.reduce((sum, s) => sum + (reports.get(s.id)?.worksheetsSubmitted ?? 0), 0);
                    return assigned > 0 ? `${Math.round((submitted / assigned) * 100)}%` : "-";
                  })()}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">이번달 상담 건수</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                  {careStats.consultationsThisMonth}건
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">목표 달성률</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                  {careStats.goalsTotal > 0
                    ? `${Math.round((careStats.goalsAchieved / careStats.goalsTotal) * 100)}%`
                    : "-"}
                </p>
              </div>
            </div>

            <h2 className="mt-8 text-lg font-medium text-[var(--foreground)]">과정별 현황</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-c)] text-left text-[var(--secondary)]">
                    <th className="px-5 py-3 font-medium">과정</th>
                    <th className="px-5 py-3 font-medium">학생 수</th>
                    <th className="px-5 py-3 font-medium">평균 단어 마스터리</th>
                    <th className="px-5 py-3 font-medium">문제지 제출률</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    students.reduce<Record<string, Profile[]>>((groups, s) => {
                      const key = s.grade_level ?? "미지정";
                      (groups[key] ??= []).push(s);
                      return groups;
                    }, {})
                  ).map(([gradeLevel, group]) => {
                    const assigned = group.reduce((sum, s) => sum + (reports.get(s.id)?.worksheetsAssigned ?? 0), 0);
                    const submitted = group.reduce((sum, s) => sum + (reports.get(s.id)?.worksheetsSubmitted ?? 0), 0);
                    return (
                      <tr key={gradeLevel} className="border-b border-[var(--border-c)] last:border-0">
                        <td className="px-5 py-3 text-[var(--foreground)]">{gradeLevel}</td>
                        <td className="px-5 py-3 text-[var(--foreground)]">{group.length}명</td>
                        <td className="px-5 py-3 text-[var(--foreground)]">
                          {Math.round(
                            (group.reduce((sum, s) => sum + (reports.get(s.id)?.wordAvgMastery ?? 0), 0) /
                              group.length) *
                              100
                          )}
                          %
                        </td>
                        <td className="px-5 py-3 text-[var(--foreground)]">
                          {assigned > 0 ? `${Math.round((submitted / assigned) * 100)}%` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {manage && (
          <div className="mt-8 flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 반 이름 (예: 월수금 중2반)"
              className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
            <button
              onClick={handleCreate}
              className="rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
            >
              반 만들기
            </button>
          </div>
        )}

        {manage && unassignedStudents.length > 0 && (
          <p className="mt-4 text-xs text-[var(--secondary)]">
            미배정 학생 {unassignedStudents.length}명 — 아래 각 반의 &quot;학생 추가&quot;에서 배정하세요.
          </p>
        )}

        {visibleClasses.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center text-sm text-[var(--secondary)]">
            {manage ? "아직 만든 반이 없습니다." : "아직 담당 반이 없습니다."}
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {visibleClasses.map((cls) => {
              const roster = students.filter((s) => s.class_id === cls.id);
              const addableStudents = students.filter((s) => s.class_id !== cls.id);
              const teacher = teacherOptions.find((t) => t.id === cls.teacher_id);
              return (
                <div key={cls.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-medium text-[var(--foreground)]">{cls.name}</h2>
                      <p className="mt-0.5 text-xs text-[var(--secondary)]">학생 {roster.length}명</p>
                    </div>
                    {manage && (
                      <div className="flex items-center gap-2">
                        <select
                          value={cls.teacher_id ?? ""}
                          onChange={(e) => handleTeacherChange(cls, e.target.value)}
                          className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1.5 text-xs"
                        >
                          <option value="">담당교사 미지정</option>
                          {teacherOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name ?? t.email}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => handleDelete(cls)} className="text-sm text-red-600 underline hover:text-red-700">
                          삭제
                        </button>
                      </div>
                    )}
                    {!manage && (
                      <span className="text-xs text-[var(--secondary)]">담당: {teacher?.name ?? teacher?.email ?? "-"}</span>
                    )}
                  </div>

                  {manage && (
                    <div className="mt-4 flex items-center gap-2">
                      <select
                        value={addTarget[cls.id] ?? ""}
                        onChange={(e) => setAddTarget((prev) => ({ ...prev, [cls.id]: e.target.value }))}
                        className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="">학생 선택</option>
                        {addableStudents.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name ?? s.email}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddStudent(cls.id)}
                        className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--mint)]/40"
                      >
                        학생 추가
                      </button>
                    </div>
                  )}

                  {roster.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--secondary)]">배정된 학생이 없습니다.</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-c)] text-left text-[var(--secondary)]">
                            <th className="px-3 py-2 font-medium">이름</th>
                            <th className="px-3 py-2 font-medium">단어 마스터리</th>
                            <th className="px-3 py-2 font-medium">유닛 통과</th>
                            <th className="px-3 py-2 font-medium">문제지 제출</th>
                            <th className="px-3 py-2 font-medium">정답률</th>
                            <th className="px-3 py-2 font-medium">최근 7일 활동</th>
                            {manage && <th className="px-3 py-2 font-medium">관리</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {roster.map((s) => {
                            const r = reports.get(s.id);
                            return (
                              <tr key={s.id} className="border-b border-[var(--border-c)] last:border-0">
                                <td className="px-3 py-3 text-[var(--foreground)]">{s.name ?? s.email}</td>
                                <td className="px-3 py-3 text-[var(--foreground)]">
                                  {r ? `${Math.round(r.wordAvgMastery * 100)}%` : "-"}
                                </td>
                                <td className="px-3 py-3 text-[var(--foreground)]">
                                  {r ? `${r.wordUnitsPassed} / ${r.wordUnitsAttempted}` : "-"}
                                </td>
                                <td className="px-3 py-3 text-[var(--foreground)]">
                                  {r ? `${r.worksheetsSubmitted} / ${r.worksheetsAssigned}` : "-"}
                                </td>
                                <td className="px-3 py-3 text-[var(--foreground)]">
                                  {r && r.mathCorrectRate !== null ? `${Math.round(r.mathCorrectRate * 100)}%` : "-"}
                                </td>
                                <td className="px-3 py-3 text-[var(--foreground)]">{r ? `${r.activityLast7d}회` : "-"}</td>
                                {manage && (
                                  <td className="px-3 py-3">
                                    <button
                                      onClick={() => handleRemoveStudent(s.id)}
                                      className="text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)]"
                                    >
                                      반 해제
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
