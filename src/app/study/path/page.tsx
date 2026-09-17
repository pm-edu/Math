import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(커리큘럼 맵, math-progression PG6) 라우트 분리.
export default function StudyPathPageRedirect() {
  redirect("/study");
}
