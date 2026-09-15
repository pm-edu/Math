// 학생 등록 과목(수학/SAT/TOEFL/영어단어) 공유 타입. "등록 과목 기준" 네비게이션 분리
// (2026-08-28) — 관리자 화면(src/lib/students.ts가 CRUD 담당)과 헤더(Header.tsx가 본인
// 과목 조회) 양쪽이 이 타입을 쓴다. SAT는 2026-09-04부터 TOEFL과 같은 방식(독립
// 라우팅+서브도메인, 별도 관리자 /admin/digital-sat)으로 학생용 화면 뼈대가 생겼다 —
// sat.pmedu4u.com, src/app/sat/page.tsx. english는 2026-09-15에 추가 — 지금까지
// math/sat/toefl 세 값뿐이라 일반 영어 단어 학습(/english/*)을 가리킬 값이 없었다.

import { createClient } from "@/lib/supabase/client";

export type StudentProgram = "math" | "sat" | "toefl" | "english";

export const PROGRAM_LABELS: Record<StudentProgram, string> = {
  math: "수학",
  sat: "SAT",
  toefl: "TOEFL",
  english: "영어 단어",
};

/**
 * 로그인한 본인의 등록 과목 — 헤더 메뉴, 마이페이지 노출 조건에 쓴다.
 * status는 'interested'(학생이 온보딩에서 직접 표시)와 'active'(staff가 확정) 둘 다
 * 포함한다 — 'active'만 보면 온보딩에서 방금 고른 과목이 헤더에 안 뜨는 문제가 있었다
 * (2026-09-15 점검에서 발견 — RUN_SIGNUP.md가 의도했던 "신규 가입자 헤더 공백 해소"가
 * 이 필터 때문에 실제로는 안 되고 있었음).
 */
export async function fetchMyPrograms(userId: string): Promise<StudentProgram[]> {
  const { data } = await createClient()
    .from("student_programs")
    .select("program")
    .eq("student_id", userId)
    .in("status", ["interested", "active"]);
  return (data ?? []).map((r) => r.program as StudentProgram);
}
