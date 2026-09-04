// 학생 등록 과목(수학/SAT/TOEFL) 공유 타입. "등록 과목 기준" 네비게이션 분리(2026-08-28) —
// 관리자 화면(src/lib/students.ts가 CRUD 담당)과 헤더(Header.tsx가 본인 과목 조회) 양쪽이
// 이 타입을 쓴다. SAT는 2026-09-04부터 TOEFL과 같은 방식(독립 라우팅+서브도메인, 별도 관리자
// /admin/digital-sat)으로 학생용 화면 뼈대가 생겼다 — sat.pmedu4u.com, src/app/sat/page.tsx.

import { createClient } from "@/lib/supabase/client";

export type StudentProgram = "math" | "sat" | "toefl";

export const PROGRAM_LABELS: Record<StudentProgram, string> = {
  math: "수학",
  sat: "SAT",
  toefl: "TOEFL",
};

/** 로그인한 본인의 등록 과목 — 헤더가 어떤 메뉴를 보여줄지 정하는 데 쓴다. */
export async function fetchMyPrograms(userId: string): Promise<StudentProgram[]> {
  const { data } = await createClient()
    .from("student_programs")
    .select("program")
    .eq("student_id", userId)
    .eq("status", "active");
  return (data ?? []).map((r) => r.program as StudentProgram);
}
