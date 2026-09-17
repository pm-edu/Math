import { redirect } from "next/navigation";

// RUN_MATH_SITE.md 2.5단계 — 옛 설계(신청→승인, home-track-entry-project) 라우트 분리.
// 삭제는 아니고 리다이렉트만 — student_curriculum_interest 등 관련 데이터는 동결 상태로 둔다.
export default function TrackPageRedirect() {
  redirect("/study");
}
