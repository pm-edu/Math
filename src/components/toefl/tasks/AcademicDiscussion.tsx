"use client";

import type { AcademicDiscussionPayload, ToeflItemPublic } from "@/lib/toefl/types";
import { wordCount } from "@/lib/toefl/word-count";
import PasteBlockedToast, { usePasteBlockToast } from "./PasteBlockedToast";

// spec §6 academic_discussion. 요청(2026-08-18): 교수 게시글 위 / 학생 답글 2개 중간 / 내 입력창
// 아래 순서 고정 레이아웃, 입력창에 포커스가 가 있어도(즉 스크롤해서 내려가도) 교수 프롬프트가
// 계속 보이도록 sticky — WriteAnEmail의 상황 프롬프트와 같은 처리.

export default function AcademicDiscussion({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { text?: string } | undefined;
  onChange: (answer: { text: string }) => void;
}) {
  const payload = item.payload as AcademicDiscussionPayload;
  const text = value?.text ?? "";
  const count = wordCount(text);
  const outOfRange = count > 0 && (count < payload.word_min || count > payload.word_max);
  const pasteToast = usePasteBlockToast();

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      {/* 교수 게시글 — sticky, 입력창에 스크롤해서 내려가도 계속 보인다. */}
      <div className="sticky top-14 z-[5] mt-3 rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)] shadow-sm">
        <p className="font-medium">Professor</p>
        <p className="mt-1">{payload.professor_post}</p>
      </div>

      {/* 학생 답글 2개 */}
      <div className="mt-3 space-y-2 rounded-xl border border-[var(--border-c)] bg-[var(--background)] p-4 text-sm">
        {payload.student_posts.map((s, i) => (
          <p key={i} className="text-[var(--secondary)]">
            <span className="font-medium text-[var(--foreground)]">{s.name}: </span>
            {s.text}
          </p>
        ))}
      </div>

      {/* 내 입력창 */}
      <div className="relative mt-3">
        <textarea
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
          onPaste={(e) => {
            e.preventDefault();
            pasteToast.trigger();
          }}
          rows={8}
          placeholder="Write your reply here..."
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--pink)] focus:ring-2 focus:ring-[var(--pink)]/50"
        />
        <PasteBlockedToast show={pasteToast.show} />
      </div>

      <p aria-live="polite" className={`mt-1 text-xs font-medium ${outOfRange ? "text-red-600" : count > 0 ? "text-[var(--mint-dark)]" : "text-[var(--secondary)]"}`}>
        {outOfRange ? "⚠" : count > 0 ? "✓" : ""} {count} words (target: {payload.word_min}–{payload.word_max})
      </p>
    </div>
  );
}
