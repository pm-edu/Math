// 접근권 단일 지점(RUN_MATH_SITE.md 2-2). 'math.session.start'/'solution.view'/... 5개로
// 세분화돼 있던 이전 버전(math-progression PG1, RUN_MATH_PROGRESSION.md)을 2개로 통합한다 —
// 실제로 5개를 구분해서 쓴 호출 지점이 하나뿐이었고("math.session.start"), 세분화된 판정이
// 필요해질 때 다시 늘리기로 함(2026-09-17). 이전엔 결제 연동 전이라 무조건 true를 반환하는
// 자리표시자였는데, 이번 단계부터 실제로 판정한다 — 그래서 롤아웃 전에 반드시
// scripts/backfill-entitlements.ts로 기존 학생들에게 grant를 채워야 한다(안 그러면 전원 차단됨).
//
// 지시서 원문 시그니처는 requireEntitlement(key)로 userId가 없었지만, 이 프로젝트엔 쿠키 세션
// 기반 서버 컴포넌트가 없다(src/app/mypage 등 전부 "use client" + 클라이언트 세션, 서버 인증은
// Bearer 토큰 API 라우트뿐 — src/lib/math/server/auth.ts 참고). userId 없이는 판정 자체가
// 불가능해서 인자로 추가했다(스펙 누락 보정, 단순 시그니처 차이 — math-progression 때부터 동일).
import { createClient } from "@supabase/supabase-js";
import { isStaff } from "@/lib/roles";

export type FeatureKey = "math.subscription" | "math.lecture";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export async function hasEntitlement(userId: string, key: FeatureKey): Promise<boolean> {
  const db = serviceClient();

  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (isStaff(profile?.role)) return true;

  // math.lecture 보유자는 math.subscription도 자동으로 통과한다(강의는 구독을 포함) — 반대는
  // 성립 안 함. subscription을 물을 땐 두 키 중 하나만 있어도, lecture를 물을 땐 lecture만 본다.
  const acceptableKeys: FeatureKey[] = key === "math.subscription" ? ["math.subscription", "math.lecture"] : ["math.lecture"];

  const nowIso = new Date().toISOString();
  const { data } = await db
    .from("entitlement_grants")
    .select("id")
    .eq("user_id", userId)
    .in("feature_key", acceptableKeys)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();

  return !!data;
}

export async function requireEntitlement(userId: string, key: FeatureKey): Promise<void> {
  const ok = await hasEntitlement(userId, key);
  if (!ok) throw new Error(`권한이 없습니다: ${key}`);
}
