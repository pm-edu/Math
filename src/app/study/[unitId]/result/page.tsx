import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(math-progression 진단·세션) 라우트 분리.
export default function UnitResultPageRedirect() {
  redirect("/study");
}
