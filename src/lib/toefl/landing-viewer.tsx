"use client";

// 랜딩 페이지를 보는 사람이 로그인했는지 · 관리 권한이 있는지.
//
// 헤더와 본문(히어로 · 하단 CTA)이 같은 값을 봐야 하는데, 각자 조회하면 profiles 쿼리가
// 두 번 나가고 두 곳의 표시가 잠깐 어긋난다. 페이지가 한 번 조회해서 내려준다.
//
// 왜 필요한가: 계정이 있는 사람에게 "가입 없이 샘플 체험"을 권하면 안 된다. 로그인 여부에
// 따라 CTA가 샘플 → 모의고사로 바뀌어야 하고, 그 판단을 세 곳(헤더·히어로·하단)이 공유한다.

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

export type LandingViewer = {
  /** null = 아직 확인 중. 확인 전에는 CTA 문구를 확정하지 않아 라벨이 뒤바뀌지 않는다. */
  loggedIn: boolean | null;
  canManage: boolean;
  /** 헤더에 "누구로 로그인했는지" 표시하는 데 쓴다. 이름이 없으면 이메일로 대체한다. */
  label: string | null;
};

const ViewerContext = createContext<LandingViewer>({ loggedIn: null, canManage: false, label: null });

export function LandingViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<LandingViewer>({ loggedIn: null, canManage: false, label: null });

  useEffect(() => {
    const supabase = createClient();

    async function apply(user: { id?: string; email?: string | null } | null | undefined) {
      if (!user?.id) {
        setViewer({ loggedIn: false, canManage: false, label: null });
        return;
      }
      const { data } = await supabase.from("profiles").select("name, role").eq("id", user.id).maybeSingle();
      setViewer({
        loggedIn: true,
        canManage: canManageMaterials(data?.role),
        label: (data?.name as string | null) || user.email || null,
      });
    }

    supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => apply(session?.user));
    return () => listener.subscription.unsubscribe();
  }, []);

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useLandingViewer(): LandingViewer {
  return useContext(ViewerContext);
}

export async function toeflLogout() {
  await createClient().auth.signOut();
  // 랜딩으로 되돌린다 — 로그아웃 후 마이페이지에 남아 있으면 곧바로 로그인으로 튕긴다.
  window.location.href = "/toefl";
}
