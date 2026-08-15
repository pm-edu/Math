"use client";

import type { ReadingMcqPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 daily_life/academic_passage 공용 렌더러(payload/answer_key 구조가 동일).
// format: "mcq"(단일 선택) | "multi_select"(복수 선택) | "insert_text"(단일 선택, mcq와 동일 UI로 처리).

export default function ReadingMcqRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { selected?: string[] } | undefined;
  onChange: (answer: { selected: string[] }) => void;
}) {
  const payload = item.payload as ReadingMcqPayload;
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
