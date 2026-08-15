"use client";

// 영역 완료 후 액션. docs/toefl-spec.md §2(고정 순서 R→L→S→W), §9, §11.
// full 모드면 다음 영역으로 이어 붙이고, 마지막 영역이거나 section_practice면 제출→리포트로 이동.
// reading/listening/speaking/writing 4개 페이지가 전부 이 컴포넌트 하나를 쓴다(P5 전엔 페이지마다
// 거의 같은 코드가 복붙돼 있었음 — 페이지가 4개가 된 지금은 "규칙의 3법칙"을 넘어서 추출함).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { nextSection } from "@/lib/toefl/section-order";
import type { ToeflSection } from "@/lib/toefl/types";

const SECTION_LABEL: Record<ToeflSection, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
};

export default function SectionDoneActions({
  attemptId,
  section,
  mode,
}: {
  attemptId: string;
  section: ToeflSection;
  mode: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = mode === "full" ? nextSection(section) : null;

  async function authHeaders() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` };
  }

  async function continueToNext() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/sections/${next}/start`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Failed to start the next section.");
        return;
      }
      router.push(`/toefl/test/${attemptId}/${next}`);
    } catch (e) {
      setError(`Failed to start the next section: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt() {
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/submit`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message ?? "Failed to submit.");
        return;
      }
      router.push(`/toefl/report/${attemptId}`);
    } catch (e) {
      setError(`Failed to submit: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {next ? (
        <button
          onClick={continueToNext}
          disabled={busy}
          className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {busy ? "Starting..." : `Continue to ${SECTION_LABEL[next]} →`}
        </button>
      ) : (
        <button
          onClick={submitAttempt}
          disabled={busy}
          className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {busy ? "Submitting..." : "Submit and see result"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
