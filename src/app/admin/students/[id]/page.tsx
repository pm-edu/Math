"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageStudents, canManageSite, ROLE_LABELS, type Role } from "@/lib/roles";
import { setStudentUnpaid } from "@/lib/classes";
import type { Profile, ClassRow } from "@/lib/profile";
import {
  loadGuardians,
  addGuardian,
  loadStudentGoals,
  addStudentGoal,
  setGoalAchieved,
  loadConsultations,
  addConsultation,
  loadStudentNotes,
  addStudentNote,
  loadParentReportTokens,
  createParentReportToken,
  loadStudentPrograms,
  setStudentProgram,
  type Guardian,
  type GuardianRelation,
  type StudentGoal,
  type Consultation,
  type ConsultationKind,
  type StudentNote,
  type StudentProgramRow,
  type ParentReportToken,
} from "@/lib/students";
import { PROGRAM_LABELS, type StudentProgram } from "@/lib/programs";
import {
  loadStudentCore,
  loadStudentUnits,
  loadStudentErrors,
  loadWeeklyTrend,
  type StudentCore,
  type UnitStat,
  type ErrorStat,
  type WeeklyTrend,
} from "@/lib/student-stats";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const RELATION_LABELS: Record<GuardianRelation, string> = {
  father: "아버지",
  mother: "어머니",
  grandparent: "조부모",
  sibling: "형제자매",
  other: "기타",
};

const CONSULTATION_LABELS: Record<ConsultationKind, string> = {
  intake: "최초 상담",
  regular: "정기 상담",
  issue: "이슈 상담",
  parent_request: "학부모 요청",
  exit: "퇴원 상담",
};

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

const cardClass = "rounded-2xl border border-[var(--border-c)] bg-white p-6";

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const studentId = params.id;

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [student, setStudent] = useState<Profile | null>(null);
  const [className, setClassName] = useState<string | null>(null);

  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [goals, setGoals] = useState<StudentGoal[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);

  const [core, setCore] = useState<StudentCore | null>(null);
  const [units, setUnits] = useState<UnitStat[]>([]);
  const [errorStats, setErrorStats] = useState<ErrorStat[]>([]);
  const [trend, setTrend] = useState<WeeklyTrend[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const [myId, setMyId] = useState<string | null>(null);
  const [reportTokens, setReportTokens] = useState<ParentReportToken[]>([]);
  const [programs, setPrograms] = useState<StudentProgramRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [g, goalList, c, n, tokens, programList] = await Promise.all([
      loadGuardians(studentId),
      loadStudentGoals(studentId),
      loadConsultations(studentId),
      loadStudentNotes(studentId),
      loadParentReportTokens(studentId),
      loadStudentPrograms(studentId),
    ]);
    setGuardians(g);
    setGoals(goalList);
    setConsultations(c);
    setNotes(n);
    setReportTokens(tokens);
    setPrograms(programList);
  }, [studentId]);

  const loadStats = useCallback(async () => {
    const [coreData, unitData, errorData, trendData] = await Promise.all([
      loadStudentCore(studentId),
      loadStudentUnits(studentId),
      loadStudentErrors(studentId),
      loadWeeklyTrend(studentId),
    ]);
    setCore(coreData);
    setUnits(unitData);
    setErrorStats(errorData);
    setTrend(trendData);
    setStatsLoaded(true);
  }, [studentId]);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (!canManageStudents(me?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      setMyRole((me?.role ?? null) as Role | null);
      setMyId(auth.user.id);

      const { data: target } = await supabase
        .from("profiles")
        .select("id, name, email, role, created_at, class_id, grade_level, unpaid")
        .eq("id", studentId)
        .maybeSingle();
      setStudent((target as Profile) ?? null);

      if (target?.class_id) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name, teacher_id, created_at")
          .eq("id", target.class_id)
          .maybeSingle();
        setClassName((cls as ClassRow | null)?.name ?? null);
      }

      loadAll();
      loadStats();
    }

    init();
  }, [router, studentId, loadAll, loadStats]);

  async function handleToggleUnpaid() {
    if (!student) return;
    const { error } = await setStudentUnpaid(student.id, !student.unpaid);
    if (error) return setError(error);
    setStudent({ ...student, unpaid: !student.unpaid });
    setMessage(student.unpaid ? "완납으로 표시했습니다." : "미납으로 표시했습니다.");
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-4xl px-6 py-16">
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
          <Link
            href="/mypage"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">
            {student?.name || "이름 없음"}
          </h1>
          {student?.unpaid && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              미납
            </span>
          )}
          {student && canManageSite(myRole) && (
            <button
              type="button"
              onClick={handleToggleUnpaid}
              className="rounded-full border border-[var(--border-c)] px-3 py-1 text-xs text-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {student.unpaid ? "완납으로 표시" : "미납으로 표시"}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          {student?.email}
          {student?.role && ` · ${ROLE_LABELS[student.role as Role]}`}
          {student?.grade_level && ` · ${student.grade_level}`}
          {className && ` · ${className}반`}
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-4 text-sm text-[var(--mint-dark)]">{message}</p>}

        <div className="mt-8 space-y-8">
          <ProgramsSection
            studentId={studentId}
            programs={programs}
            onAdded={(msg) => {
              setMessage(msg);
              setError(null);
              loadAll();
            }}
            onError={(msg) => {
              setError(msg);
              setMessage(null);
            }}
          />
          <OverviewSection core={core} units={units} errorStats={errorStats} trend={trend} loaded={statsLoaded} />
          {myId && (
            <ParentReportSection
              studentId={studentId}
              tokens={reportTokens}
              createdBy={myId}
              onAdded={(msg) => {
                setMessage(msg);
                setError(null);
                loadAll();
              }}
              onError={(msg) => {
                setError(msg);
                setMessage(null);
              }}
            />
          )}
          <GuardiansSection
            studentId={studentId}
            guardians={guardians}
            onAdded={(msg) => {
              setMessage(msg);
              setError(null);
              loadAll();
            }}
            onError={(msg) => {
              setError(msg);
              setMessage(null);
            }}
          />
          <GoalsSection
            studentId={studentId}
            goals={goals}
            onAdded={(msg) => {
              setMessage(msg);
              setError(null);
              loadAll();
            }}
            onError={(msg) => {
              setError(msg);
              setMessage(null);
            }}
          />
          <ConsultationsSection
            studentId={studentId}
            consultations={consultations}
            onAdded={(msg) => {
              setMessage(msg);
              setError(null);
              loadAll();
            }}
            onError={(msg) => {
              setError(msg);
              setMessage(null);
            }}
          />
          <NotesSection
            studentId={studentId}
            notes={notes}
            onAdded={(msg) => {
              setMessage(msg);
              setError(null);
              loadAll();
            }}
            onError={(msg) => {
              setError(msg);
              setMessage(null);
            }}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}

type SectionProps<T> = {
  studentId: string;
  onAdded: (message: string) => void;
  onError: (message: string) => void;
};

// "등록 과목 기준" 네비게이션 분리(2026-08-28, [[toefl-subsystem-plan]] [A]) — 여기서 켠
// 과목만 이 학생의 헤더 메뉴에 나타난다(Header.tsx가 student_programs를 읽어 링크를 붙임).
// SAT는 아직 학생용 화면 자체가 없어 토글은 있지만 눌러도 갈 곳이 없다 — 나중에 TOEFL처럼
// 독립된 서브시스템이 생기면 그때 헤더 쪽에 링크를 추가하면 된다(데이터 모델은 이미 준비됨).
function ProgramsSection({ studentId, programs, onAdded, onError }: SectionProps<StudentProgramRow> & { programs: StudentProgramRow[] }) {
  const [busy, setBusy] = useState<StudentProgram | null>(null);
  const activeSet = new Set(programs.filter((p) => p.status === "active").map((p) => p.program));

  async function toggle(program: StudentProgram) {
    const nextEnabled = !activeSet.has(program);
    setBusy(program);
    const { error } = await setStudentProgram(studentId, program, nextEnabled);
    setBusy(null);
    if (error) return onError(error);
    onAdded(nextEnabled ? `${PROGRAM_LABELS[program]}에 등록했습니다.` : `${PROGRAM_LABELS[program]} 등록을 해지했습니다.`);
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">등록 과목</h2>
      <p className="mt-1 text-sm text-[var(--secondary)]">
        여기서 켠 과목만 이 학생의 메뉴에 나타납니다. SAT는 학생용 화면이 아직 없어 준비 중입니다.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(PROGRAM_LABELS) as StudentProgram[]).map((program) => {
          const active = activeSet.has(program);
          return (
            <button
              key={program}
              type="button"
              onClick={() => toggle(program)}
              disabled={busy === program}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                active
                  ? "border-[var(--pink)] bg-[var(--pink)] text-[var(--pink-dark)]"
                  : "border-[var(--border-c)] text-[var(--secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              {active ? "✓ " : ""}
              {PROGRAM_LABELS[program]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GuardiansSection({
  studentId,
  guardians,
  onAdded,
  onError,
}: SectionProps<Guardian> & { guardians: Guardian[] }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", relation: "mother" as GuardianRelation });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return onError("보호자 이름을 입력해주세요.");
    setSaving(true);
    const { error } = await addGuardian(studentId, form);
    setSaving(false);
    if (error) return onError(error);
    setForm({ name: "", phone: "", email: "", relation: "mother" });
    onAdded("보호자를 등록했습니다.");
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">보호자</h2>
      <ul className="mt-3 space-y-2">
        {guardians.length === 0 && <p className="text-sm text-[var(--secondary)]">등록된 보호자가 없습니다.</p>}
        {guardians.map((g) => (
          <li key={g.id} className="rounded-lg border border-[var(--border-c)] px-4 py-3 text-sm">
            <span className="font-medium text-[var(--foreground)]">{g.name}</span>
            <span className="ml-2 rounded-full bg-[var(--mint)] px-2 py-0.5 text-xs text-[var(--mint-dark)]">
              {RELATION_LABELS[g.relation]}
            </span>
            <p className="mt-1 text-[var(--secondary)]">
              {g.phone || "연락처 없음"} {g.email && `· ${g.email}`}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="이름"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
        <select
          value={form.relation}
          onChange={(e) => setForm({ ...form, relation: e.target.value as GuardianRelation })}
          className={inputClass}
        >
          {Object.entries(RELATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="연락처"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="이메일 (선택)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={saving}
          className="sm:col-span-2 rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "저장 중..." : "보호자 추가"}
        </button>
      </form>
    </section>
  );
}

function GoalsSection({ studentId, goals, onAdded, onError }: SectionProps<StudentGoal> & { goals: StudentGoal[] }) {
  const [form, setForm] = useState({ goal_text: "", target_score: "", target_date: "" });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.goal_text.trim()) return onError("목표 내용을 입력해주세요.");
    setSaving(true);
    const { error } = await addStudentGoal(studentId, form);
    setSaving(false);
    if (error) return onError(error);
    setForm({ goal_text: "", target_score: "", target_date: "" });
    onAdded("목표를 등록했습니다.");
  }

  async function toggleAchieved(goal: StudentGoal) {
    const { error } = await setGoalAchieved(goal.id, !goal.achieved);
    if (error) return onError(error);
    onAdded(goal.achieved ? "목표를 미달성으로 되돌렸습니다." : "목표를 달성으로 표시했습니다.");
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">학생 목표</h2>
      <ul className="mt-3 space-y-2">
        {goals.length === 0 && <p className="text-sm text-[var(--secondary)]">등록된 목표가 없습니다.</p>}
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-c)] px-4 py-3 text-sm"
          >
            <div>
              <span className={g.achieved ? "text-[var(--secondary)] line-through" : "text-[var(--foreground)]"}>
                {g.goal_text}
              </span>
              {(g.target_score || g.target_date) && (
                <p className="mt-1 text-xs text-[var(--secondary)]">
                  {g.target_score && `목표점수 ${g.target_score}`}
                  {g.target_score && g.target_date && " · "}
                  {g.target_date && `목표일 ${g.target_date}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleAchieved(g)}
              className="shrink-0 rounded-full border border-[var(--border-c)] px-3 py-1 text-xs text-[var(--secondary)] hover:text-[var(--foreground)]"
            >
              {g.achieved ? "달성 취소" : "달성 표시"}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          placeholder="목표 (예: 내신 2등급)"
          value={form.goal_text}
          onChange={(e) => setForm({ ...form, goal_text: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <input
          type="text"
          placeholder="목표 점수 (선택)"
          value={form.target_score}
          onChange={(e) => setForm({ ...form, target_score: e.target.value })}
          className={inputClass}
        />
        <input
          type="date"
          value={form.target_date}
          onChange={(e) => setForm({ ...form, target_date: e.target.value })}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={saving}
          className="sm:col-span-2 rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "저장 중..." : "목표 추가"}
        </button>
      </form>
    </section>
  );
}

function ConsultationsSection({
  studentId,
  consultations,
  onAdded,
  onError,
}: SectionProps<Consultation> & { consultations: Consultation[] }) {
  const [form, setForm] = useState({
    kind: "regular" as ConsultationKind,
    participants: "",
    summary: "",
    action_items: "",
    next_due_on: "",
    visible_to_parent: false,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.summary.trim()) return onError("상담 요약을 입력해주세요.");
    setSaving(true);
    const { error } = await addConsultation(studentId, form);
    setSaving(false);
    if (error) return onError(error);
    setForm({ kind: "regular", participants: "", summary: "", action_items: "", next_due_on: "", visible_to_parent: false });
    onAdded("상담 기록을 등록했습니다.");
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">상담 기록</h2>
      <p className="mt-1 text-xs text-[var(--secondary)]">학생·학부모에게는 공개되지 않습니다(직원 전용).</p>
      <ul className="mt-3 space-y-2">
        {consultations.length === 0 && <p className="text-sm text-[var(--secondary)]">상담 기록이 없습니다.</p>}
        {consultations.map((c) => (
          <li key={c.id} className="rounded-lg border border-[var(--border-c)] px-4 py-3 text-sm">
            <span className="rounded-full bg-[var(--mint)] px-2 py-0.5 text-xs text-[var(--mint-dark)]">
              {CONSULTATION_LABELS[c.kind]}
            </span>
            <span className="ml-2 text-xs text-[var(--secondary)]">
              {new Date(c.held_at).toLocaleDateString("ko-KR")}
            </span>
            <p className="mt-1 text-[var(--foreground)]">{c.summary}</p>
            {c.action_items && <p className="mt-1 text-xs text-[var(--secondary)]">후속조치: {c.action_items}</p>}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value as ConsultationKind })}
          className={inputClass}
        >
          {Object.entries(CONSULTATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="참석자 (선택)"
          value={form.participants}
          onChange={(e) => setForm({ ...form, participants: e.target.value })}
          className={inputClass}
        />
        <textarea
          rows={2}
          placeholder="상담 요약"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <textarea
          rows={2}
          placeholder="후속 조치 (선택)"
          value={form.action_items}
          onChange={(e) => setForm({ ...form, action_items: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <input
          type="date"
          value={form.next_due_on}
          onChange={(e) => setForm({ ...form, next_due_on: e.target.value })}
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)]">
          <input
            type="checkbox"
            checked={form.visible_to_parent}
            onChange={(e) => setForm({ ...form, visible_to_parent: e.target.checked })}
          />
          학부모 공개
        </label>
        <button
          type="submit"
          disabled={saving}
          className="sm:col-span-2 rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "저장 중..." : "상담 기록 추가"}
        </button>
      </form>
    </section>
  );
}

function NotesSection({ studentId, notes, onAdded, onError }: SectionProps<StudentNote> & { notes: StudentNote[] }) {
  const [form, setForm] = useState({
    condition_score: "",
    focus_score: "",
    understanding_score: "",
    activity_score: "",
    homework_state: "",
    unit_covered: "",
    stuck_point: "",
    next_plan: "",
    share_with_parent: false,
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await addStudentNote(studentId, form);
    setSaving(false);
    if (error) return onError(error);
    setForm({
      condition_score: "",
      focus_score: "",
      understanding_score: "",
      activity_score: "",
      homework_state: "",
      unit_covered: "",
      stuck_point: "",
      next_plan: "",
      share_with_parent: false,
    });
    onAdded("관찰노트를 등록했습니다.");
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">수업 관찰노트</h2>
      <ul className="mt-3 space-y-2">
        {notes.length === 0 && <p className="text-sm text-[var(--secondary)]">등록된 관찰노트가 없습니다.</p>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-[var(--border-c)] px-4 py-3 text-sm">
            <p className="text-xs text-[var(--secondary)]">
              {new Date(n.created_at).toLocaleDateString("ko-KR")}
              {n.unit_covered && ` · ${n.unit_covered}`}
            </p>
            {n.stuck_point && <p className="mt-1 text-[var(--foreground)]">막힌 부분: {n.stuck_point}</p>}
            {n.next_plan && <p className="mt-1 text-[var(--secondary)]">다음 계획: {n.next_plan}</p>}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-4">
        <input
          type="number"
          min={1}
          max={4}
          placeholder="컨디션(1-4)"
          value={form.condition_score}
          onChange={(e) => setForm({ ...form, condition_score: e.target.value })}
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          max={5}
          placeholder="집중도(1-5)"
          value={form.focus_score}
          onChange={(e) => setForm({ ...form, focus_score: e.target.value })}
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          max={5}
          placeholder="이해도(1-5)"
          value={form.understanding_score}
          onChange={(e) => setForm({ ...form, understanding_score: e.target.value })}
          className={inputClass}
        />
        <input
          type="number"
          min={1}
          max={5}
          placeholder="활동성(1-5)"
          value={form.activity_score}
          onChange={(e) => setForm({ ...form, activity_score: e.target.value })}
          className={inputClass}
        />
        <input
          type="text"
          placeholder="숙제 상태 (선택)"
          value={form.homework_state}
          onChange={(e) => setForm({ ...form, homework_state: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <input
          type="text"
          placeholder="다룬 단원 (선택)"
          value={form.unit_covered}
          onChange={(e) => setForm({ ...form, unit_covered: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <textarea
          rows={2}
          placeholder="막힌 부분 (선택)"
          value={form.stuck_point}
          onChange={(e) => setForm({ ...form, stuck_point: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <textarea
          rows={2}
          placeholder="다음 계획 (선택)"
          value={form.next_plan}
          onChange={(e) => setForm({ ...form, next_plan: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <label className="flex items-center gap-2 text-sm text-[var(--secondary)] sm:col-span-2">
          <input
            type="checkbox"
            checked={form.share_with_parent}
            onChange={(e) => setForm({ ...form, share_with_parent: e.target.checked })}
          />
          학부모 공개
        </label>
        <button
          type="submit"
          disabled={saving}
          className="sm:col-span-4 rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "저장 중..." : "관찰노트 추가"}
        </button>
      </form>
    </section>
  );
}

const ERROR_CATEGORY_LABELS: Record<string, string> = {
  concept: "개념",
  calculation: "계산",
  interpretation: "해석",
  time: "시간",
};

const CHART_COLORS = ["var(--pink-dark)", "var(--mint-dark)", "#C99A3E", "#5B87C9"];

function KpiCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        warn ? "border-red-200 bg-red-50" : "border-[var(--border-c)] bg-white"
      }`}
    >
      <p className="text-xs text-[var(--secondary)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? "text-red-600" : "text-[var(--foreground)]"}`}>
        {value}
      </p>
    </div>
  );
}

function OverviewSection({
  core,
  units,
  errorStats,
  trend,
  loaded,
}: {
  core: StudentCore | null;
  units: UnitStat[];
  errorStats: ErrorStat[];
  trend: WeeklyTrend[];
  loaded: boolean;
}) {
  const radarUnits = [...units].sort((a, b) => b.attempts - a.attempts).slice(0, 6);
  const weakUnits = units
    .filter((u) => u.attempts >= 3)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 5);
  const trendData = trend.map((t) => ({
    week: new Date(t.week_start).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
    accuracy: t.accuracy,
  }));
  const errorData = errorStats.map((e) => ({
    name: ERROR_CATEGORY_LABELS[e.error_category] ?? e.error_category,
    value: e.cnt,
  }));

  if (loaded && !core && units.length === 0 && trend.length === 0) {
    return (
      <section className={cardClass}>
        <h2 className="text-lg font-medium text-[var(--foreground)]">개요</h2>
        <p className="mt-3 text-sm text-[var(--secondary)]">
          아직 이 학생의 학습 기록(출결·문제풀이·과제)이 없어 통계를 보여드릴 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">개요</h2>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard
          label="출석률"
          value={core?.attendance_rate != null ? `${core.attendance_rate}%` : "-"}
          warn={core?.attendance_rate != null && core.attendance_rate < 85}
        />
        <KpiCard
          label="제출률"
          value={core?.submission_rate != null ? `${core.submission_rate}%` : "-"}
          warn={core?.submission_rate != null && core.submission_rate < 80}
        />
        <KpiCard
          label="최초시도 정답률"
          value={core?.first_try_accuracy != null ? `${core.first_try_accuracy}%` : "-"}
        />
        <KpiCard
          label="성장 Δ (28일)"
          value={core?.growth_delta != null ? `${core.growth_delta > 0 ? "+" : ""}${core.growth_delta}%p` : "-"}
          warn={core?.growth_delta != null && core.growth_delta < 0}
        />
        <KpiCard label="리스크 점수" value={core ? `${core.risk_score}` : "-"} warn={!!core && core.risk_score >= 55} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-[var(--secondary)]">단원별 정답률</p>
          {radarUnits.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--secondary)]">아직 단원별 풀이 기록이 없습니다.</p>
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <RadarChart data={radarUnits} outerRadius="75%">
                  <PolarGrid stroke="var(--border-c)" />
                  <PolarAngleAxis dataKey="unit_name" tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--secondary)" }} />
                  <Radar dataKey="accuracy" stroke="var(--pink-dark)" fill="var(--pink)" fillOpacity={0.5} />
                  <Tooltip formatter={(v) => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--secondary)]">최근 8주 정답률 추이</p>
          {trendData.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--secondary)]">아직 추이를 보여줄 만큼 데이터가 없습니다.</p>
          ) : (
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <CartesianGrid stroke="var(--border-c)" strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--secondary)" }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Line type="monotone" dataKey="accuracy" stroke="var(--mint-dark)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-[var(--secondary)]">오답 유형</p>
          {errorData.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--secondary)]">오답 유형 기록이 아직 없습니다.</p>
          ) : (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={errorData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75}>
                    {errorData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--secondary)]">취약 단원 Top 5</p>
          {weakUnits.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--secondary)]">아직 판단할 만큼 풀이 기록이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {weakUnits.map((u) => (
                <li key={u.unit_id} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--foreground)]">{u.unit_name}</span>
                  <span className="text-[var(--secondary)]">
                    {u.accuracy}% · {u.attempts}회
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ParentReportSection({
  studentId,
  tokens,
  createdBy,
  onAdded,
  onError,
}: {
  studentId: string;
  tokens: ParentReportToken[];
  createdBy: string;
  onAdded: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    const { token, error } = await createParentReportToken(studentId, createdBy);
    setCreating(false);
    if (error || !token) return onError(error ?? "링크 생성에 실패했습니다.");
    onAdded("학부모 리포트 링크를 만들었습니다. 30일간 유효합니다.");
  }

  async function handleCopy(token: ParentReportToken) {
    const url = `${window.location.origin}/report/${token.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(token.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-medium text-[var(--foreground)]">학부모 리포트 링크</h2>
      <p className="mt-1 text-xs text-[var(--secondary)]">
        로그인 없이 열람 가능한 읽기 전용 링크입니다(출결·제출률·성적 추이·공개 코멘트만 보이고, 리스크 점수나 다른 학생 비교는 안 보여요). 30일 후 자동 만료됩니다.
      </p>

      <ul className="mt-4 space-y-2">
        {tokens.length === 0 && <p className="text-sm text-[var(--secondary)]">유효한 링크가 없습니다.</p>}
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm">
            <span className="text-[var(--secondary)]">
              {new Date(t.expires_at).toLocaleDateString("ko-KR")}까지 유효
            </span>
            <button
              type="button"
              onClick={() => handleCopy(t)}
              className="rounded-full border border-[var(--border-c)] px-3 py-1 text-xs text-[var(--foreground)] hover:bg-[var(--mint)]/40"
            >
              {copiedId === t.id ? "복사됨" : "링크 복사"}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="mt-4 rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
      >
        {creating ? "만드는 중..." : "새 링크 만들기"}
      </button>
    </section>
  );
}
