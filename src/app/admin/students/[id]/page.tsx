"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageStudents, ROLE_LABELS, type Role } from "@/lib/roles";
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
  type Guardian,
  type GuardianRelation,
  type StudentGoal,
  type Consultation,
  type ConsultationKind,
  type StudentNote,
} from "@/lib/students";

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
  const [student, setStudent] = useState<Profile | null>(null);
  const [className, setClassName] = useState<string | null>(null);

  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [goals, setGoals] = useState<StudentGoal[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [g, goalList, c, n] = await Promise.all([
      loadGuardians(studentId),
      loadStudentGoals(studentId),
      loadConsultations(studentId),
      loadStudentNotes(studentId),
    ]);
    setGuardians(g);
    setGoals(goalList);
    setConsultations(c);
    setNotes(n);
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

      const { data: target } = await supabase
        .from("profiles")
        .select("id, name, email, role, created_at, class_id")
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
    }

    init();
  }, [router, studentId, loadAll]);

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
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">
          {student?.name || "이름 없음"}
        </h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          {student?.email}
          {student?.role && ` · ${ROLE_LABELS[student.role as Role]}`}
          {className && ` · ${className}반`}
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-4 text-sm text-[var(--mint-dark)]">{message}</p>}

        <div className="mt-8 space-y-8">
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
