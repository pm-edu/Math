"use client";

// 수학 전용 관리자 화면 공통 레이아웃. 권한 확인을 여기서 한 번만 하고, 통과한 경우에만
// 사이드바 셸과 자식 화면을 그린다(TOEFL 어드민과 같은 패턴, src/app/admin/toefl/layout.tsx).
// 진짜 차단은 각 화면이 쿼리하는 테이블의 RLS — 여기서 막는 건 화면 표시일 뿐이다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/math/admin/AdminShell";
import { AdminMeProvider, type AdminMe } from "@/lib/math/admin-me";
import { createClient } from "@/lib/supabase/client";
import { isStaff, type Role } from "@/lib/roles";

export default function MathAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase.from("profiles").select("name, role").eq("id", auth.user.id).maybeSingle();
      if (!isStaff(data?.role)) {
        setDenied(true);
        return;
      }
      setMe({ id: auth.user.id, name: data?.name ?? null, role: data?.role as Role });
    }
    init();
  }, [router]);

  if (denied) {
    return (
      <div className="grid min-h-screen place-items-center bg-en-paper px-6">
        <p className="text-sm font-semibold text-en-ink">이 화면을 볼 권한이 없습니다.</p>
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
