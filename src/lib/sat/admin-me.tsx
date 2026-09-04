"use client";

// SAT 관리 화면들이 공유하는 "지금 로그인한 관리자" 정보. src/lib/toefl/admin-me.tsx와
// 똑같은 패턴 — SAT를 TOEFL처럼 독립시키는 게 목표라 일부러 공용 모듈로 합치지 않고
// 그대로 복제한다(SAT 쪽만 나중에 바꿔도 TOEFL에 영향 없게).

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
  if (!me) throw new Error("useAdminMe는 /admin/digital-sat 레이아웃 안에서만 쓸 수 있습니다.");
  return me;
}
