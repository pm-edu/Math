"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 단어 활용 문장 작성 AI 채점 연습. 마스터리 사다리와 무관한 독립 연습 도구 —
// 결과는 화면에만 보이고 어디에도 저장되지 않는다.

type Result = { correct: boolean; feedback: string };

export default function SentenceWritePractice({ lemma, meaningKo }: { lemma: string; meaningKo: string | null }) {
  const [open, setOpen] = useState(false);
  const [sentence, setSentence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/grade-sentence", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lemma, meaning: meaningKo ?? "", sentence: trimmed }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok || !data.ok) {
      setError(data.message ?? "채점에 실패했습니다.");
      return;
    }
    setResult({ correct: data.correct, feedback: data.feedback });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1 text-xs text-[var(--foreground)] hover:bg-[var(--mint)]/40"
      >
        문장 연습
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/10 p-4">
      <p className="text-xs text-[var(--secondary)]">
        <span className="font-medium text-[var(--foreground)]">{lemma}</span>
        {meaningKo ? `(${meaningKo})` : ""}를 사용해서 짧은 영어 문장을 만들어보세요.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          placeholder={`예: I ${lemma} ...`}
          maxLength={200}
          className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !sentence.trim()}
          className="rounded-full bg-[var(--pink)] px-4 py-2 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {submitting ? "채점 중..." : "채점"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {result && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.correct ? "bg-[var(--mint)]/40 text-[var(--foreground)]" : "bg-red-50 text-red-700"
          }`}
        >
          <span className="font-medium">{result.correct ? "잘했어요!" : "다시 볼까요"}</span>
          <p className="mt-1">{result.feedback}</p>
        </div>
      )}
    </div>
  );
}
