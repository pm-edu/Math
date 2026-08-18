"use client";

import Link from "next/link";

// 익명(체험) 세션 표시. Supabase 익명 로그인(signInAnonymously)으로 만든 세션은 정식 계정과
// 똑같이 RLS를 통과하지만, 브라우저 세션이 사라지면 그 attempt에 다시 접근할 방법이 없다 —
// 그걸 학생에게 알려주고 가입(계정 승격)으로 유도하는 배지. 학생 응시 화면은 영어만 쓴다(§14).

export default function GuestBadge() {
  return (
    <Link
      href="/signup"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pink)] bg-[var(--pink-light)]/30 px-3 py-1 text-xs font-medium text-[var(--pink-dark)]"
    >
      Trying it out · Sign up to save your results →
    </Link>
  );
}
