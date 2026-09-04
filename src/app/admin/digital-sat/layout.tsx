"use client";

// SAT 관리 화면 공통 레이아웃 — src/app/admin/toefl/layout.tsx와 같은 패턴(권한 확인 1회,
// 통과해야 셸+자식을 그림). 진짜 차단은 DB의 RLS(is_staff()) — 여기는 화면 표시만 막는다.
//
// 이 경로는 sat.pmedu4u.com 에서도 열린다(src/middleware.ts 의 SAT_ALLOWED_PREFIXES).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SatAdminShell from "@/components/sat/admin/SatAdminShell";
import { AdminMeProvider, type AdminMe } from "@/lib/sat/admin-me";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials, type Role } from "@/lib/roles";

export default function SatAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?sat=1");
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
      <div data-theme="en" className="grid min-h-screen place-items-center bg-[var(--en-paper)] px-6">
        <p className="text-sm font-semibold text-[var(--en-ink)]">이 화면을 볼 권한이 없습니다.</p>
      </div>
    );
  }

  if (!me) return null;

  return (
    <AdminMeProvider value={me}>
      <SatAdminShell>{children}</SatAdminShell>
    </AdminMeProvider>
  );
}
