import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(math-progression 진단·세션) 라우트 분리. 삭제 아님 —
// math_sessions 등 관련 테이블은 동결 상태로 두고 새로 쓰지 않는다.
export default function UnitSessionPageRedirect() {
  redirect("/study");
}
