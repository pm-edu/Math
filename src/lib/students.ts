// 학생관리(보호자·목표·상담·관찰노트·등록과목) 데이터 접근 함수.
// src/lib/classes.ts 와 같은 패턴: 얇은 supabase 래퍼 함수만 둔다.

import { createClient } from "@/lib/supabase/client";
import type { StudentProgram } from "@/lib/programs";

export type GuardianRelation = "father" | "mother" | "grandparent" | "sibling" | "other";
export type ConsultationKind = "intake" | "regular" | "issue" | "parent_request" | "exit";

export type Guardian = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  kakao_linked: boolean;
  report_consent: boolean;
  preferred_contact_time: string | null;
  relation: GuardianRelation;
  is_primary: boolean;
};

export type StudentGoal = {
  id: string;
  student_id: string;
  goal_text: string;
  target_score: string | null;
  target_date: string | null;
  achieved: boolean;
  created_at: string;
};

export type Consultation = {
  id: string;
  student_id: string;
  kind: ConsultationKind;
  held_at: string;
  participants: string | null;
  summary: string;
  action_items: string | null;
  next_due_on: string | null;
  visible_to_parent: boolean;
};

export type StudentNote = {
  id: string;
  student_id: string;
  condition_score: number | null;
  focus_score: number | null;
  understanding_score: number | null;
  activity_score: number | null;
  homework_state: string | null;
  unit_covered: string | null;
  stuck_point: string | null;
  next_plan: string | null;
  share_with_parent: boolean;
  created_at: string;
};

export type ParentReportToken = {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function loadParentReportTokens(studentId: string): Promise<ParentReportToken[]> {
  const { data } = await createClient()
    .from("parent_report_tokens")
    .select("id, token, expires_at, created_at")
    .eq("student_id", studentId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return (data as ParentReportToken[]) ?? [];
}

export async function createParentReportToken(
  studentId: string,
  createdBy: string
): Promise<{ token: ParentReportToken | null; error: string | null }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createClient()
    .from("parent_report_tokens")
    .insert({ student_id: studentId, token: randomToken(), expires_at: expiresAt, created_by: createdBy })
    .select("id, token, expires_at, created_at")
    .single();
  if (error || !data) return { token: null, error: error?.message ?? "링크 생성에 실패했습니다." };
  return { token: data as ParentReportToken, error: null };
}

export type StudentCareStats = {
  consultationsThisMonth: number;
  goalsTotal: number;
  goalsAchieved: number;
};

/** 사이트 전체 현황 카드용 — 이번달 상담 건수, 목표 달성률. */
export async function loadStudentCareStats(userIds: string[]): Promise<StudentCareStats> {
  const empty = { consultationsThisMonth: 0, goalsTotal: 0, goalsAchieved: 0 };
  if (userIds.length === 0) return empty;

  const supabase = createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ data: consultations }, { data: goals }] = await Promise.all([
    supabase
      .from("consultations")
      .select("student_id")
      .in("student_id", userIds)
      .gte("held_at", monthStart.toISOString()),
    supabase.from("student_goals").select("achieved").in("student_id", userIds),
  ]);

  return {
    consultationsThisMonth: consultations?.length ?? 0,
    goalsTotal: goals?.length ?? 0,
    goalsAchieved: (goals ?? []).filter((g) => g.achieved).length,
  };
}

export async function loadGuardians(studentId: string): Promise<Guardian[]> {
  const { data } = await createClient()
    .from("student_guardians")
    .select(
      "relation, is_primary, guardians(id, name, phone, email, kakao_linked, report_consent, preferred_contact_time)"
    )
    .eq("student_id", studentId);

  return (data ?? [])
    .filter((row) => row.guardians)
    .map((row) => {
      const g = row.guardians as unknown as Omit<Guardian, "relation" | "is_primary">;
      return { ...g, relation: row.relation as GuardianRelation, is_primary: row.is_primary };
    });
}

export async function addGuardian(
  studentId: string,
  guardian: { name: string; phone: string; email: string; relation: GuardianRelation }
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("guardians")
    .insert({
      name: guardian.name,
      phone: guardian.phone || null,
      email: guardian.email || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "보호자 등록에 실패했습니다." };

  const { error: linkError } = await supabase
    .from("student_guardians")
    .insert({ student_id: studentId, guardian_id: data.id, relation: guardian.relation });
  return { error: linkError?.message ?? null };
}

export async function loadStudentGoals(studentId: string): Promise<StudentGoal[]> {
  const { data } = await createClient()
    .from("student_goals")
    .select("id, student_id, goal_text, target_score, target_date, achieved, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data ?? []) as StudentGoal[];
}

export async function addStudentGoal(
  studentId: string,
  goal: { goal_text: string; target_score: string; target_date: string }
): Promise<{ error: string | null }> {
  const { error } = await createClient()
    .from("student_goals")
    .insert({
      student_id: studentId,
      goal_text: goal.goal_text,
      target_score: goal.target_score || null,
      target_date: goal.target_date || null,
    });
  return { error: error?.message ?? null };
}

export async function setGoalAchieved(id: string, achieved: boolean): Promise<{ error: string | null }> {
  const { error } = await createClient().from("student_goals").update({ achieved }).eq("id", id);
  return { error: error?.message ?? null };
}

export async function loadConsultations(studentId: string): Promise<Consultation[]> {
  const { data } = await createClient()
    .from("consultations")
    .select(
      "id, student_id, kind, held_at, participants, summary, action_items, next_due_on, visible_to_parent"
    )
    .eq("student_id", studentId)
    .order("held_at", { ascending: false });
  return (data ?? []) as Consultation[];
}

export async function addConsultation(
  studentId: string,
  consultation: {
    kind: ConsultationKind;
    participants: string;
    summary: string;
    action_items: string;
    next_due_on: string;
    visible_to_parent: boolean;
  }
): Promise<{ error: string | null }> {
  const { error } = await createClient()
    .from("consultations")
    .insert({
      student_id: studentId,
      kind: consultation.kind,
      participants: consultation.participants || null,
      summary: consultation.summary,
      action_items: consultation.action_items || null,
      next_due_on: consultation.next_due_on || null,
      visible_to_parent: consultation.visible_to_parent,
    });
  return { error: error?.message ?? null };
}

export async function loadStudentNotes(studentId: string): Promise<StudentNote[]> {
  const { data } = await createClient()
    .from("student_notes")
    .select(
      "id, student_id, condition_score, focus_score, understanding_score, activity_score, homework_state, unit_covered, stuck_point, next_plan, share_with_parent, created_at"
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data ?? []) as StudentNote[];
}

export async function addStudentNote(
  studentId: string,
  note: {
    condition_score: string;
    focus_score: string;
    understanding_score: string;
    activity_score: string;
    homework_state: string;
    unit_covered: string;
    stuck_point: string;
    next_plan: string;
    share_with_parent: boolean;
  }
): Promise<{ error: string | null }> {
  const toScore = (v: string) => (v.trim() ? Number(v) : null);
  const { error } = await createClient()
    .from("student_notes")
    .insert({
      student_id: studentId,
      condition_score: toScore(note.condition_score),
      focus_score: toScore(note.focus_score),
      understanding_score: toScore(note.understanding_score),
      activity_score: toScore(note.activity_score),
      homework_state: note.homework_state || null,
      unit_covered: note.unit_covered || null,
      stuck_point: note.stuck_point || null,
      next_plan: note.next_plan || null,
      share_with_parent: note.share_with_parent,
    });
  return { error: error?.message ?? null };
}

export type StudentProgramRow = {
  program: StudentProgram;
  status: "active" | "paused" | "ended";
  enrolled_at: string;
};

export async function loadStudentPrograms(studentId: string): Promise<StudentProgramRow[]> {
  const { data } = await createClient()
    .from("student_programs")
    .select("program, status, enrolled_at")
    .eq("student_id", studentId)
    .order("enrolled_at");
  return (data as StudentProgramRow[]) ?? [];
}

// 껐다 켜는 토글 하나로 관리한다 — 켜면 upsert(다시 켠 경우 ended_at을 지워 active로 되돌림),
// 끄면 행을 지우지 않고 status='ended'로만 남긴다(언제 등록/해지했는지 이력이 남는 편이 낫다).
export async function setStudentProgram(
  studentId: string,
  program: StudentProgram,
  enabled: boolean
): Promise<{ error: string | null }> {
  const supabase = createClient();
  if (enabled) {
    const { error } = await supabase
      .from("student_programs")
      .upsert({ student_id: studentId, program, status: "active", ended_at: null }, { onConflict: "student_id,program" });
    return { error: error?.message ?? null };
  }
  const { error } = await supabase
    .from("student_programs")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("program", program);
  return { error: error?.message ?? null };
}
