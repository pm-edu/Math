"use client";

import type { WriteAnEmailPayload, ToeflItemPublic } from "@/lib/toefl/types";
import { wordCount } from "@/lib/toefl/word-count";
import PasteBlockedToast, { usePasteBlockToast } from "./PasteBlockedToast";

// spec §6 write_an_email. 요청(2026-08-18): 상황 프롬프트는 스크롤해도 상단에 고정, 단어 수는
// 실시간이되 범위를 벗어나도 제출을 막지는 않는다(색+아이콘으로만 안내), 붙여넣기 차단, 맞춤법
// 검사 끔. top-14는 페이지 헤더(sticky top-0, 대략 44~48px 높이)에 안 가리게 잡은 여유값이다.

export default function WriteAnEmail({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { text?: string } | undefined;
  onChange: (answer: { text: string }) => void;
}) {
  const payload = item.payload as WriteAnEmailPayload;
  const text = value?.text ?? "";
  const count = wordCount(text);
  const outOfRange = count > 0 && (count < payload.word_min || count > payload.word_max);
  const pasteToast = usePasteBlockToast();

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      <div className="sticky top-14 z-[5] mt-3 rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)] shadow-sm">
        <p>{payload.scenario}</p>
        <p className="mt-2 text-xs font-medium text-[var(--secondary)]">Make sure to include:</p>
        <ul className="mt-1 list-inside list-disc text-xs text-[var(--secondary)]">
          {payload.required_points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>

      <div className="relative mt-3">
        <textarea
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          onPaste={(e) => {
            e.preventDefault();
            pasteToast.trigger();
          }}
          rows={10}
          placeholder="Write your email here..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--pink)]"
        />
        <PasteBlockedToast show={pasteToast.show} />
      </div>

      <p aria-live="polite" className={`mt-1 text-xs font-medium ${outOfRange ? "text-red-600" : count > 0 ? "text-[var(--mint-dark)]" : "text-[var(--secondary)]"}`}>
        {outOfRange ? "⚠" : count > 0 ? "✓" : ""} {count} words (target: {payload.word_min}–{payload.word_max})
      </p>
    </div>
  );
}
