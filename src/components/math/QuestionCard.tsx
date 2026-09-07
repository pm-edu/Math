"use client";

// 문제 본문 + 답 입력(mcq/numeric) + 정오 피드백. /study/[unitId](세션)와 /study/onboarding
// (진단) 둘 다 똑같은 문제-답변 UI가 필요해서 여기로 뽑아뒀다.

import { MathText } from "@/components/ProblemBody";
import { useLang } from "@/lib/i18n";

const LETTERS = ["A", "B", "C", "D"];

export interface QuestionCardProps {
  contentText: string;
  imageUrl?: string;
  answerFormat: "mcq" | "numeric" | "expression" | "free";
  choices: string[];
  mcqChoice: number | null;
  onMcqChoice: (index: number) => void;
  numericValue: string;
  onNumericChange: (value: string) => void;
  feedback: { correct: boolean; solution: string } | null;
}

export function QuestionCard({
  contentText,
  imageUrl,
  answerFormat,
  choices,
  mcqChoice,
  onMcqChoice,
  numericValue,
  onNumericChange,
  feedback,
}: QuestionCardProps) {
  const { t } = useLang();

  return (
    <>
      <MathText text={contentText} className="text-base leading-relaxed text-[var(--foreground)]" />
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mt-4 max-w-full rounded-lg" />
      )}

      <div className="mt-6">
        {answerFormat === "mcq" ? (
          <div className="flex flex-col gap-3">
            {choices.map((choice, i) => {
              const isSelected = mcqChoice === i;
              const stateClass = !feedback
                ? isSelected
                  ? "border-[var(--pink)] bg-[var(--pink-light)]/40"
                  : "border-[var(--border-c)] hover:bg-[var(--mint)]/10"
                : isSelected
                  ? feedback.correct
                    ? "border-[var(--mint-dark)] bg-[var(--mint)]/50"
                    : "border-red-400 bg-red-50"
                  : "border-[var(--border-c)] opacity-60";
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!!feedback}
                  onClick={() => onMcqChoice(i)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${stateClass}`}
                >
                  <span className="font-medium text-[var(--secondary)]">{LETTERS[i]}</span>
                  <MathText text={choice} className="text-[var(--foreground)]" />
                </button>
              );
            })}
          </div>
        ) : (
          <input
            type="text"
            inputMode="text"
            value={numericValue}
            disabled={!!feedback}
            onChange={(e) => onNumericChange(e.target.value)}
            placeholder="예: 7/2 또는 0.5"
            className="w-40 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
          />
        )}
      </div>

      {feedback && (
        <div
          className={`mt-6 rounded-xl p-4 text-sm ${
            feedback.correct ? "bg-[var(--mint)]/40 text-[var(--mint-dark)]" : "bg-red-50 text-red-700"
          }`}
        >
          <p className="font-medium">{feedback.correct ? t("study_correct") : t("study_incorrect")}</p>
          {!feedback.correct && <MathText text={feedback.solution} className="mt-2 text-[var(--foreground)]" />}
        </div>
      )}
    </>
  );
}
