// 권한 5단계 모델.
// 화면 표시/가드는 이 파일의 판별 함수를 쓰고, 실제 차단은 DB 보안정책(RLS)이 한다.
// (재배포 트리거: Vercel 배포 반영)

export const ROLES = ["owner", "admin", "teacher", "assistant", "student"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "최종관리자",
  admin: "관리자",
  teacher: "교사",
  assistant: "조교",
  student: "학생",
};

export const ROLE_DESC: Record<Role, string> = {
  owner: "전체 권한 · 관리자 임명",
  admin: "학생 · 자료 · 사이트 설정 관리",
  teacher: "학생 · 숙제 · 성적 관리",
  assistant: "자료 · 숙제 · 성적 열람",
  student: "학습",
};

// 관리 계층(직원) 여부 — 학생이 아닌 모든 역할
export function isStaff(role?: string | null): boolean {
  return role === "owner" || role === "admin" || role === "teacher" || role === "assistant";
}

// 사이트 운영: 설정 · 강좌 · 강의 · 분류 · 메일 · 수강신청 = 최종관리자 + 관리자
export function canManageSite(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

// 자료(문제 · 문제지 · 추출 · 풀이검수) + 숙제 배포 = 직원 전원
export function canManageMaterials(role?: string | null): boolean {
  return isStaff(role);
}

// 성적 · 제출현황 열람 = 직원 전원 (조교 포함)
export function canViewGrades(role?: string | null): boolean {
  return isStaff(role);
}

// 학생 명단 열람 = 최종관리자 + 관리자 + 교사 (조교 제외)
export function canManageStudents(role?: string | null): boolean {
  return role === "owner" || role === "admin" || role === "teacher";
}

// 역할 부여 화면 접근 = 최종관리자 + 관리자
export function canAssignRoles(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

// 내 역할이 남에게 부여할 수 있는 역할 목록.
// - 최종관리자: 모든 역할
// - 관리자: 교사 · 조교 · 학생만 (관리자/최종관리자 임명은 최종관리자만)
export function assignableRoles(myRole?: string | null): Role[] {
  if (myRole === "owner") return ["owner", "admin", "teacher", "assistant", "student"];
  if (myRole === "admin") return ["teacher", "assistant", "student"];
  return [];
}
