"use client";

// 제출 확인 모달. Submit 버튼을 눌러도 확인 없이 바로 전체 attempt가 확정되던 문제 수정
// (2026-08-18, 코드리뷰 후속 우선순위 ①). 되돌릴 수 없는 동작이라 실수 클릭을 막는다.
// 응시 화면 계열 컴포넌트라 useLang은 import하지 않는다(TOEFL UI 작업 규칙 8번).

import { useEffect } from "react";

export default function SubmitConfirmModal({
  open,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="submit-confirm-title" className="text-lg font-semibold text-[var(--foreground)]">
          Submit this test?
        </h2>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          Once submitted, you can&apos;t change any answers. This finalizes and scores your test.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-[var(--border-c)] px-5 py-2 text-sm text-[var(--foreground)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-[var(--pink-dark)] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Submitting..." : "✓ Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
