import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(신청→승인, home-track-entry-project) 라우트 분리.
export default function TrackDetailPageRedirect() {
  redirect("/study");
}
