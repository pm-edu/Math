// 수학 학습 진행 구조 PG1: 권한 자리 (RUN_MATH_PROGRESSION.md 1-4). 결제는 나중 — 지금은
// entitlement_grants/staff 판정 로직을 미리 만들어 두되, 반환값은 항상 true(전면 허용)다.
// 나중에 결제 연동이 끝나면 이 함수 내부의 마지막 return만 판정 결과로 바꾸면 된다.
//
// 지시서 원문 시그니처는 requireEntitlement(key)로 userId가 없었지만, 이 프로젝트엔 쿠키 세션
// 기반 서버 컴포넌트가 없다(src/app/mypage 등 전부 "use client" + 클라이언트 세션, 서버 인증은
// Bearer 토큰 API 라우트뿐 — src/lib/math/server/auth.ts 참고). userId 없이는 판정 자체가
// 불가능해서 인자로 추가했다(스펙 누락 보정, 단순 시그니처 차이).
import { createClient } from "@supabase/supabase-js";
import { isStaff } from "@/lib/roles";

export type FeatureKey =
  | "math.session.start"
  | "math.solution.view"
  | "math.worksheet.download"
  | "math.report.detail"
  | "math.path.full";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export async function hasEntitlement(userId: string, key: FeatureKey): Promise<boolean> {
  const db = serviceClient();

  const { data: profile } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (isStaff(profile?.role)) return true;

  const nowIso = new Date().toISOString();
  await db
    .from("entitlement_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("feature_key", key)
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();
  // 위 조회 결과(유효한 grant 존재 여부)는 지금은 쓰지 않는다 — 결제 도입 전이라 전면 허용.

  return true;
}

export async function requireEntitlement(userId: string, key: FeatureKey): Promise<void> {
  const ok = await hasEntitlement(userId, key);
  if (!ok) throw new Error(`권한이 없습니다: ${key}`);
}
