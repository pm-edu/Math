"use client";

// TOEFL 관리 화면 공통 레이아웃. 권한 확인을 여기서 한 번만 하고, 통과한 경우에만
// 사이드바 셸과 자식 화면을 그린다. 각 화면은 더 이상 자기 권한 검사를 하지 않는다.
// (진짜 차단은 DB의 RLS — 여기서 막는 건 화면 표시일 뿐이다)
//
// 이 경로는 toefl.pmedu4u.com 에서도 열린다(src/middleware.ts 의 TOEFL_ALLOWED_PREFIXES).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/toefl/admin/AdminShell";
import { AdminMeProvider, type AdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials, type Role } from "@/lib/roles";

export default function ToeflAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }
      const { data } = await supabase.from("profiles").select("name, role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(data?.role)) {
        setDenied(true);
        return;
      }
      setMe({ id: auth.user.id, name: data?.name ?? null, role: data?.role as Role });
    }
    init();
  }, [router]);

  if (denied) {
    return (
      <div data-theme="en" className="toefl-admin grid min-h-screen place-items-center bg-[var(--en-paper)] px-6">
        <p className="text-sm font-semibold text-[var(--en-ink)]">이 화면을 볼 권한이 없습니다.</p>
      </div>
    );
  }

  // 권한 확인 전에는 아무것도 그리지 않는다 — 잠깐 보였다 사라지는 깜빡임 방지.
  if (!me) return null;

  return (
    <AdminMeProvider value={me}>
      <AdminShell>{children}</AdminShell>
    </AdminMeProvider>
  );
}
