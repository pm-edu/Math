// 관리자 전체 대시보드(`/admin/dashboard`) 데이터 접근 함수. 전부 SQL View(v_*)만 select한다.

import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";

export type MonthlyStat = {
  month: string;
  new_students: number;
  avg_attendance_rate: number | null;
  avg_submission_correct_rate: number | null;
  avg_accuracy: number | null;
};

export async function loadMonthly(): Promise<MonthlyStat[]> {
  const { data } = await createClient().from("v_monthly").select("*").order("month");
  return (data as MonthlyStat[]) ?? [];
}

export type UnitWeakness = {
  unit_id: string;
  unit_name: string;
  curriculum_group: string;
  curriculum_detail: string;
  attempts: number;
  accuracy: number;
  weakness_score: number;
};

export async function loadUnitWeakness(limit = 10): Promise<UnitWeakness[]> {
  const { data } = await createClient()
    .from("v_unit_weakness")
    .select("*")
    .order("weakness_score", { ascending: false })
    .limit(limit);
  return (data as UnitWeakness[]) ?? [];
}

export type RiskStudent = {
  student_id: string;
  name: string | null;
  email: string | null;
  attendance_rate: number | null;
  submission_rate: number | null;
  growth_delta: number | null;
  risk_score: number;
  main_cause: string;
};

export async function loadRiskList(): Promise<RiskStudent[]> {
  const { data } = await createClient().from("v_risk_list").select("*").order("risk_score", { ascending: false });
  return (data as RiskStudent[]) ?? [];
}

export async function loadUnpaidStudents(): Promise<Profile[]> {
  const { data } = await createClient()
    .from("profiles")
    .select("id, name, email, role, created_at, class_id, grade_level, unpaid")
    .eq("unpaid", true)
    .eq("role", "student")
    .order("name");
  return (data as Profile[]) ?? [];
}
