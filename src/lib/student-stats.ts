// 학생 상세 "개요" 탭 통계. docs/student-management.md P4 — 전부 SQL View(v_*)를 그대로 select만 한다.

import { createClient } from "@/lib/supabase/client";

export type StudentCore = {
  student_id: string;
  name: string | null;
  email: string | null;
  attendance_rate: number | null;
  submission_rate: number | null;
  first_try_accuracy: number | null;
  growth_delta: number | null;
  risk_score: number;
};

export async function loadStudentCore(studentId: string): Promise<StudentCore | null> {
  const { data } = await createClient().from("v_student_core").select("*").eq("student_id", studentId).maybeSingle();
  return (data as StudentCore) ?? null;
}

export type UnitStat = {
  unit_id: string;
  unit_name: string;
  curriculum_group: string;
  curriculum_detail: string;
  attempts: number;
  accuracy: number;
  wrong_count: number;
};

export async function loadStudentUnits(studentId: string): Promise<UnitStat[]> {
  const { data } = await createClient()
    .from("v_student_units")
    .select("*")
    .eq("student_id", studentId)
    .order("attempts", { ascending: false });
  return (data as UnitStat[]) ?? [];
}

export type ErrorStat = { error_category: string; cnt: number; pct: number };

export async function loadStudentErrors(studentId: string): Promise<ErrorStat[]> {
  const { data } = await createClient().from("v_student_errors").select("*").eq("student_id", studentId);
  return (data as ErrorStat[]) ?? [];
}

export type WeeklyTrend = { week_start: string; attempts: number; accuracy: number };

export async function loadWeeklyTrend(studentId: string): Promise<WeeklyTrend[]> {
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await createClient()
    .from("v_student_weekly_trend")
    .select("*")
    .eq("student_id", studentId)
    .gte("week_start", eightWeeksAgo)
    .order("week_start");
  return (data as WeeklyTrend[]) ?? [];
}

export type ExamResult = {
  assessment_id: string;
  title: string;
  kind: string;
  exam_date: string;
  raw_score: number | null;
  max_score: number;
  percentage: number | null;
  grade_label: string | null;
};

export async function loadStudentExams(studentId: string): Promise<ExamResult[]> {
  const { data } = await createClient()
    .from("v_student_exams")
    .select("*")
    .eq("student_id", studentId)
    .order("exam_date");
  return (data as ExamResult[]) ?? [];
}
