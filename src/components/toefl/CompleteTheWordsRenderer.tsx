"use client";

import type { ReactNode } from "react";
import type { CompleteTheWordsPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 complete_the_words: payload.paragraph 안에 payload.blanks[i].masked 문자열이 그대로
// 등장한다("The eco_omy grew..."). 그 부분을 인라인 입력칸으로 바꿔서 렌더링한다.
// 응시 화면은 spec §14대로 영어만 사용한다(해설·리포트만 한국어).

export default function CompleteTheWordsRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: Record<string, string> | undefined;
  onChange: (answer: Record<string, string>) => void;
}) {
  const payload = item.payload as CompleteTheWordsPayload;

  function setBlank(id: string, v: string) {
    onChange({ ...(value ?? {}), [id]: v });
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      <p className="mt-4 rounded-xl border border-[var(--border-c)] bg-white p-5 text-[16px] leading-loose text-[var(--foreground)]">
        {renderParagraph(payload, value ?? {}, setBlank)}
      </p>
    </div>
  );
}

function renderParagraph(
  payload: CompleteTheWordsPayload,
  value: Record<string, string>,
  onBlankChange: (id: string, v: string) => void
): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = payload.paragraph;

  payload.blanks.forEach((blank, idx) => {
    const pos = remaining.indexOf(blank.masked);
    if (pos === -1) return;
    const before = remaining.slice(0, pos);
    if (before) parts.push(<span key={`t-${idx}`}>{before}</span>);
    parts.push(
      <input
        key={blank.id}
        type="text"
        value={value[blank.id] ?? ""}
        onChange={(e) => onBlankChange(blank.id, e.target.value)}
        placeholder={"_".repeat(blank.length)}
        aria-label={`Blank ${idx + 1}`}
        style={{ width: `${Math.max(blank.length, 5)}ch` }}
        className="mx-1 rounded border-b-2 border-[var(--pink)] bg-[var(--pink-light)]/30 px-1 text-center font-medium text-[var(--foreground)] outline-none focus:bg-[var(--pink-light)]/60"
      />
    );
    remaining = remaining.slice(pos + blank.masked.length);
  });

  if (remaining) parts.push(<span key="tail">{remaining}</span>);
  return parts;
}
