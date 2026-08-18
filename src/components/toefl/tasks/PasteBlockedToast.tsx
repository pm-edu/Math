"use client";

import { useEffect, useRef, useState } from "react";

// WriteAnEmail·AcademicDiscussion 둘 다 붙여넣기 차단 시 같은 안내를 띄운다(요청) — 토스트
// 컴포넌트 자체가 이 프로젝트에 없어서 새로 만들되, 최소한으로 둘이 공유한다.

// onPaste 핸들러에서 trigger()만 부르면 2.5초짜리 토스트를 보여주고 알아서 꺼진다.
export function usePasteBlockToast() {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function trigger() {
    setShow(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 2500);
  }

  return { show, trigger };
}

export default function PasteBlockedToast({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-[var(--foreground)]/90 px-3 py-1.5 text-xs font-medium text-white shadow"
    >
      ⛔ Pasting is disabled — please type your answer.
    </div>
  );
}
