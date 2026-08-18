"use client";

import type { McqOption } from "@/lib/toefl/types";

// 선택형 문항(리스닝/리딩 mcq류) 리뷰용 읽기 전용 목록. 정오는 색 + 아이콘을 항상 같이 쓴다
// (요청, 접근성). "정답 노출"은 이 화면(제출 후 리뷰)에서만 하고, 응시 중 OptionsList.tsx는
// 이 컴포넌트를 안 쓴다(별개 컴포넌트로 완전히 분리 — 실수로 채점 전 정답이 새는 경로를 원천 차단).

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function OptionsReview({
  options,
  selected,
  correct,
}: {
  options: McqOption[];
  selected: string[];
  correct: string[];
}) {
  return (
    <div className="space-y-2">
      {options.map((opt, i) => {
        const wasSelected = selected.includes(opt.id);
        const isCorrect = correct.includes(opt.id);

        let style = "border-[var(--border-c)] bg-white text-[var(--secondary)]";
        let marker: string | null = null;
        if (isCorrect && wasSelected) {
          style = "border-[var(--mint-dark)] bg-[var(--mint)]/30 text-[var(--foreground)]";
          marker = "✓ Your answer (correct)";
        } else if (isCorrect && !wasSelected) {
          style = "border-[var(--mint-dark)]/60 bg-[var(--mint)]/10 text-[var(--foreground)]";
          marker = "✓ Correct answer";
        } else if (!isCorrect && wasSelected) {
          style = "border-red-400 bg-red-50 text-[var(--foreground)]";
          marker = "✗ Your answer";
        }

        return (
          <div key={opt.id} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-left text-sm ${style}`}>
            <span>
              <span className="font-semibold">{LETTERS[i] ?? opt.id}</span> {opt.text}
            </span>
            {marker && <span className="shrink-0 text-xs font-medium">{marker}</span>}
          </div>
        );
      })}
    </div>
  );
}
