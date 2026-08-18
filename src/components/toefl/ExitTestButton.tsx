"use client";

import { useRouter } from "next/navigation";

// 응시 중 홈으로 나가는 버튼(2026-08-18, 실사용 피드백 — 응시 화면은 spec §10 "전역 네비게이션
// 숨김"이라 나갈 방법이 전혀 없었음). 4개 응시 페이지(reading/listening/speaking/writing)가
// 전부 쓰므로 공용 컴포넌트로 뺀다.
// 확인창을 넣는 이유: 답안은 이미 자동저장돼 있지만(§11 2번), 타이머(deadline_at)는 서버에서
// 계속 흐르고 있어서 나갔다 늦게 돌아오면 시간이 부족해질 수 있다 — 실수로 누르는 걸 막는다.

export default function ExitTestButton() {
  const router = useRouter();

  function handleExit() {
    const ok = window.confirm(
      "Leave this test? Your answers so far are saved, but the timer keeps running while you're away."
    );
    if (ok) router.push("/toefl");
  }

  return (
    <button
      type="button"
      onClick={handleExit}
      className="text-xs font-medium text-[var(--secondary)] underline hover:text-[var(--foreground)]"
    >
      ← Exit test
    </button>
  );
}
