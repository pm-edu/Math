// 반(class) 데이터 접근 함수. 리포트 집계는 각 서브시스템의 기존 테이블을 그대로 읽는다
// (staff는 이미 sessions/unit_progress/problem_submissions/worksheet_assignments를 조회할 수 있음 —
//  roles-tier.sql, vocab v2 마이그레이션의 "staff view ..." 정책 참고).

import { createClient } from "@/lib/supabase/client";
import type { ClassRow } from "@/lib/profile";

export async function loadClasses(): Promise<ClassRow[]> {
  const supabase = createClient();
  const { data } = await supabase.from("classes").select("id, name, teacher_id, created_at").order("created_at");
  return (data ?? []) as ClassRow[];
}

export async function createClass(name: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("classes").insert({ name });
  return { error: error?.message ?? null };
}

export async function deleteClass(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("classes").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function setClassTeacher(classId: string, teacherId: string | null): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("classes").update({ teacher_id: teacherId }).eq("id", classId);
  return { error: error?.message ?? null };
}

export async function setStudentClass(studentId: string, classId: string | null): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_student_class", { target_id: studentId, new_class_id: classId });
  return { error: error?.message ?? null };
}

export async function setStudentUnpaid(studentId: string, unpaid: boolean): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_student_unpaid", { target_id: studentId, new_value: unpaid });
  return { error: error?.message ?? null };
}

export async function setStudentGradeLevel(
  studentId: string,
  gradeLevel: string | null
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_student_grade_level", {
    target_id: studentId,
    new_grade_level: gradeLevel,
  });
  return { error: error?.message ?? null };
}

export type StudentReport = {
  wordUnitsAttempted: number;
  wordUnitsPassed: number;
  wordAvgMastery: number; // 0~1
  worksheetsAssigned: number;
  worksheetsSubmitted: number;
  mathCorrectRate: number | null; // 0~1, 채점 가능한 제출이 없으면 null
  activityLast7d: number; // 최근 7일 영어 학습 세션 횟수
};

const EMPTY_REPORT: StudentReport = {
  wordUnitsAttempted: 0,
  wordUnitsPassed: 0,
  wordAvgMastery: 0,
  worksheetsAssigned: 0,
  worksheetsSubmitted: 0,
  mathCorrectRate: null,
  activityLast7d: 0,
};

export async function loadStudentReports(userIds: string[]): Promise<Map<string, StudentReport>> {
  const result = new Map<string, StudentReport>();
  if (userIds.length === 0) return result;
  userIds.forEach((id) => result.set(id, { ...EMPTY_REPORT }));

  const supabase = createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: unitProgress },
    { data: assignments },
    { data: submissions },
    { data: sessions },
  ] = await Promise.all([
    supabase.from("unit_progress").select("user_id, mastery_ratio, status").in("user_id", userIds),
    supabase.from("worksheet_assignments").select("user_id").in("user_id", userIds),
    supabase.from("problem_submissions").select("user_id, worksheet_id, is_correct").in("user_id", userIds),
    supabase.from("sessions").select("user_id").in("user_id", userIds).gte("started_at", sevenDaysAgo),
  ]);

  type Bucket = {
    masterySum: number;
    unitCount: number;
    passedCount: number;
    worksheetIds: Set<string>;
    correct: number;
    gradable: number;
  };
  const byUser = new Map<string, Bucket>();
  function bucket(userId: string) {
    let b = byUser.get(userId);
    if (!b) {
      b = { masterySum: 0, unitCount: 0, passedCount: 0, worksheetIds: new Set(), correct: 0, gradable: 0 };
      byUser.set(userId, b);
    }
    return b;
  }

  (unitProgress ?? []).forEach((row) => {
    const b = bucket(row.user_id);
    b.masterySum += row.mastery_ratio ?? 0;
    b.unitCount += 1;
    if (row.status === "passed") b.passedCount += 1;
  });

  const assignedCount = new Map<string, number>();
  (assignments ?? []).forEach((row) => {
    assignedCount.set(row.user_id, (assignedCount.get(row.user_id) ?? 0) + 1);
  });

  (submissions ?? []).forEach((row) => {
    const b = bucket(row.user_id);
    if (row.worksheet_id) b.worksheetIds.add(row.worksheet_id);
    if (row.is_correct !== null) {
      b.gradable += 1;
      if (row.is_correct) b.correct += 1;
    }
  });

  const activityCount = new Map<string, number>();
  (sessions ?? []).forEach((row) => {
    activityCount.set(row.user_id, (activityCount.get(row.user_id) ?? 0) + 1);
  });

  userIds.forEach((userId) => {
    const b = byUser.get(userId);
    result.set(userId, {
      wordUnitsAttempted: b?.unitCount ?? 0,
      wordUnitsPassed: b?.passedCount ?? 0,
      wordAvgMastery: b && b.unitCount > 0 ? b.masterySum / b.unitCount : 0,
      worksheetsAssigned: assignedCount.get(userId) ?? 0,
      worksheetsSubmitted: b?.worksheetIds.size ?? 0,
      mathCorrectRate: b && b.gradable > 0 ? b.correct / b.gradable : null,
      activityLast7d: activityCount.get(userId) ?? 0,
    });
  });

  return result;
}
