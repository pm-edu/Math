"use client";

import type { McqOption, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 공용 렌더러 — payload가 {options, format?, select_count?} 모양인 유형은 전부 이걸로 그린다:
// Reading의 daily_life/academic_passage, Listening의 choose_a_response/conversation/
// announcement/academic_talk. 전부 answer_key가 {correct:[...]}, response가 {selected:[...]}로
// 구조가 같다(scoring/score-item.ts의 MCQ_LIKE_TASK_TYPES와 대응).
// format: "mcq"(단일 선택, choose_a_response처럼 format 자체가 없는 경우도 단일 선택으로 취급) |
// "multi_select"(복수 선택) | "insert_text"/"replay"(단일 선택, mcq와 동일 UI로 처리).

type OptionsPayload = { options: McqOption[]; format?: string; select_count?: number };

export default function McqOptionsRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
}) {
  const payload = item.payload as OptionsPayload;
  const selected = value?.selected ?? [];
  const isMulti = payload.format === "multi_select";

  function toggle(optionId: string) {
    if (isMulti) {
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId];
      onChange({ selected: next });
    } else {
      onChange({ selected: [optionId] });
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      {isMulti && (
        <p className="mt-1 text-xs text-[var(--secondary)]">
          Select {payload.select_count ?? 2} answer{(payload.select_count ?? 2) > 1 ? "s" : ""}.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {payload.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                isSelected
                  ? "border-[var(--pink)] bg-[var(--pink-light)]/40"
                  : "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/20"
              }`}
            >
              <span className="font-semibold text-[var(--secondary)]">{opt.id}</span>
              <span className="text-[var(--foreground)]">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
