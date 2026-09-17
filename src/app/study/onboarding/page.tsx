import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 온보딩은 /onboarding/subjects 하나로 확정됐다. 이 화면(옛
// 진단·배치 온보딩, math-progression PG4)은 리다이렉트만 남기고 내용을 비운다. 삭제 아님 —
// math_placements 등 관련 테이블/로직(src/lib/math/server/diagnostic.ts)은 동결 상태로 둔다.
export default function StudyOnboardingRedirect() {
  redirect("/onboarding/subjects");
}
