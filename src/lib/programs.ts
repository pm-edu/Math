// 학생 등록 과목(수학/SAT/TOEFL) 공유 타입. "등록 과목 기준" 네비게이션 분리(2026-08-28) —
// 관리자 화면(src/lib/students.ts가 CRUD 담당)과 헤더(Header.tsx가 본인 과목 조회) 양쪽이
// 이 타입을 쓴다. SAT는 아직 학생용 화면이 없어 헤더에 링크가 없지만, 나중에 TOEFL처럼(심지어
// 수학과 완전 분리까지) 독립될 수 있다는 전제로 값 자체는 처음부터 넣어둔다.

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
