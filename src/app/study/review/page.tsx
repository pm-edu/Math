import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(복습 큐, math-progression PG6) 라우트 분리.
export default function StudyReviewPageRedirect() {
  redirect("/study");
}
