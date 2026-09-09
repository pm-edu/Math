"use client";

// 수학 전용 관리자 화면(/admin/math/*)들이 공유하는 "지금 로그인한 관리자" 정보.
// 권한 확인은 /admin/math/layout.tsx 가 한 번만 하고, 그 결과를 이 컨텍스트로 내려준다
// (TOEFL 관리자와 같은 패턴 — src/lib/toefl/admin-me.tsx 참고).
//
// 화면의 역할 체크는 표시용일 뿐이고, 실제 차단은 DB의 RLS가 담당한다.

import { createContext, useContext } from "react";
import type { Role } from "@/lib/roles";

export type AdminMe = { id: string; name: string | null; role: Role };

const AdminMeContext = createContext<AdminMe | null>(null);

export function AdminMeProvider({ value, children }: { value: AdminMe; children: React.ReactNode }) {
  return <AdminMeContext.Provider value={value}>{children}</AdminMeContext.Provider>;
}

/** 레이아웃이 권한 확인을 마친 뒤에만 자식이 렌더되므로 항상 값이 있다. */
export function useAdminMe(): AdminMe {
  const me = useContext(AdminMeContext);
  if (!me) throw new Error("useAdminMe는 /admin/math 레이아웃 안에서만 쓸 수 있습니다.");
  return me;
}
