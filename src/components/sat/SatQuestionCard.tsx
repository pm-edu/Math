"use client";

// 문항 하나를 보여주고 채점 결과를 인라인으로 표시한다. src/app/toefl/practice/[type]/page.tsx의
// ResultPanel 패턴(별도 페이지 이동 없이 카드 바로 아래 결과 표시)을 그대로 따른다.

import { useMemo, useState } from "react";
import { MathText } from "@/components/ProblemBody";
import { renderFigureToSvg } from "@/lib/sat/figure/render";
import type { FigureSpec } from "@/lib/sat/figure/types";

export interface SatPublicQuestion {
  id: string;
  section: "rw" | "math";
  domain: string;
  skill: string;
  difficulty: number;
  format: "mcq" | "spr";
  prompt: string;
  payload: { choices?: [string, string, string, string]; figure?: FigureSpec | null };
}

interface ScoreResult {
  isCorrect: boolean;
  normalized: string | null;
  explanationKo: string;
}

const LETTERS = ["A", "B", "C", "D"] as const;

function FigureView({ figure }: { figure: FigureSpec }) {
  const { svg, alt } = useMemo(() => renderFigureToSvg(figure), [figure]);
  return (
    <div className="my-4">
      <div className="max-w-sm [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="sr-only">{alt}</span>
    </div>
  );
}

export default function SatQuestionCard({
  question,
  onAnswered,
}: {
  question: SatPublicQuestion;
  onAnswered?: (result: ScoreResult) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [sprInput, setSprInput] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = question.format === "mcq" ? selected : sprInput.trim();
  const canSubmit = !!answer && !result;

  async function handleSubmit() {
    if (!answer) return;
    setSubmitting(true);
    setError(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/sat/practice/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ questionId: question.id, answer }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "채점에 실패했습니다.");
        return;
      }
      setResult(data);
      onAnswered?.(data);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--en-line)] bg-white p-6">
      <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--en-ink-soft)]">
        {question.section === "rw" ? "Reading & Writing" : "Math"} · 난이도 {question.difficulty}
      </p>

      <div className="mt-3">
        <MathText text={question.prompt} className="text-[15px] leading-relaxed text-[var(--en-ink)]" />
      </div>

      {question.payload.figure && <FigureView figure={question.payload.figure} />}

      {question.format === "mcq" && question.payload.choices ? (
        <div className="mt-4 flex flex-col gap-2">
          {question.payload.choices.map((choice, i) => {
            const letter = LETTERS[i];
            const isSelected = selected === letter;
            return (
              <button
                key={letter}
                type="button"
                disabled={!!result}
                onClick={() => setSelected(letter)}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  isSelected ? "border-[var(--en-gold)] bg-[var(--en-gold-soft)]" : "border-[var(--en-line)] hover:bg-[#F7F8FA]"
                } ${result ? "cursor-default" : ""}`}
              >
                <span className="font-bold text-[var(--en-ink-soft)]">{letter}</span>
                <MathText text={choice} className="text-[var(--en-ink)]" />
              </button>
            );
          })}
        </div>
      ) : question.format === "spr" ? (
        <div className="mt-4">
          <input
            type="text"
            inputMode="text"
            value={sprInput}
            onChange={(e) => setSprInput(e.target.value)}
            disabled={!!result}
            placeholder="예: 7/2 또는 0.5"
            maxLength={6}
            className="w-40 rounded-lg border border-[var(--en-line)] px-3 py-2 text-sm outline-none focus:border-[var(--en-gold)]"
          />
        </div>
      ) : null}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {!result && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="mt-5 rounded-full bg-[var(--en-gold)] px-5 py-2 text-sm font-bold text-[var(--en-on-gold)] disabled:opacity-50"
        >
          {submitting ? "채점 중…" : "제출"}
        </button>
      )}

      {result && (
        <div
          className={`mt-5 rounded-xl border p-4 ${
            result.isCorrect ? "border-[var(--en-success-ink)] bg-[var(--en-success-soft)]" : "border-red-300 bg-red-50"
          }`}
        >
          <p className="text-sm font-bold text-[var(--en-ink)]">{result.isCorrect ? "정답입니다" : "오답입니다"}</p>
          <div className="mt-2">
            <MathText text={result.explanationKo} className="text-sm text-[var(--en-ink)]" />
          </div>
        </div>
      )}
    </div>
  );
}
