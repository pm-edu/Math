"use client";

import { useEffect } from "react";
import type { McqOption } from "@/lib/toefl/types";

// DailyLifeReading·AcademicPassage가 공유하는 선택지 목록(둘 다 §6 ReadingMcqPayload 구조를
// 그대로 씀). 공용 요구사항: 클릭 영역 전체가 반응(라디오 점만 누르는 방식 금지), A/B/C/D
// 키보드 단축키, 선택 취소 가능.

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function OptionsList({
  options,
  isMulti,
  selectCount,
  selected,
  onChange,
}: {
  options: McqOption[];
  isMulti: boolean;
  selectCount?: number;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  function toggle(optionId: string) {
    if (isMulti) {
      const next = selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId];
      onChange(next);
    } else {
      // 단일 선택은 같은 항목을 다시 누르면 선택 취소된다.
      onChange(selected.includes(optionId) ? [] : [optionId]);
    }
  }

  // A/B/C/D 키보드 단축키. 다른 입력칸(예: 에세이 텍스트영역)에 포커스가 가 있을 땐 끼어들지
  // 않는다 — 문항 렌더러들이 한 화면에 같이 있을 일은 없지만 방어적으로 막아둔다.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      const idx = LETTERS.indexOf(e.key.toUpperCase());
      if (idx === -1 || idx >= options.length) return;
      toggle(options[idx].id);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, selected, isMulti]);

  return (
    <div>
      {isMulti && (
        <p className="mb-2 text-xs text-[var(--secondary)]">
          Select {selectCount ?? 2} answer{(selectCount ?? 2) > 1 ? "s" : ""}.
        </p>
      )}
      <div className="space-y-2">
        {options.map((opt, i) => {
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
              <span className="font-semibold text-[var(--secondary)]">{LETTERS[i] ?? opt.id}</span>
              <span className="text-[var(--foreground)]">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
