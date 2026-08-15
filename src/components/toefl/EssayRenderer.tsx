"use client";

import type { AcademicDiscussionPayload, ToeflItemPublic, WriteAnEmailPayload } from "@/lib/toefl/types";

// spec §6 write_an_email / academic_discussion 공용 렌더러 — 둘 다 "맥락 표시 + 자유 서술 +
// 단어 수 범위"로 구조가 같다(§10: "실시간 단어 수 카운터, 목표 범위 이탈 시 경고").
// 채점은 ai_rubric(§12) — 여기서는 점수를 보여주지 않는다(제출 후 finish에서 AI가 채점).

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export default function EssayRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { text?: string } | undefined;
  onChange: (answer: { text: string }) => void;
}) {
  const payload = item.payload as WriteAnEmailPayload | AcademicDiscussionPayload;
  const text = value?.text ?? "";
  const count = wordCount(text);
  const outOfRange = count > 0 && (count < payload.word_min || count > payload.word_max);

  const isEmail = "scenario" in payload;

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      <div className="mt-3 rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)]">
        {isEmail ? (
          <>
            <p>{(payload as WriteAnEmailPayload).scenario}</p>
            <p className="mt-2 text-xs font-medium text-[var(--secondary)]">Make sure to include:</p>
            <ul className="mt-1 list-inside list-disc text-xs text-[var(--secondary)]">
              {(payload as WriteAnEmailPayload).required_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="font-medium">Professor:</p>
            <p>{(payload as AcademicDiscussionPayload).professor_post}</p>
            <div className="mt-3 space-y-2">
              {(payload as AcademicDiscussionPayload).student_posts.map((s, i) => (
                <p key={i} className="text-[var(--secondary)]">
                  <span className="font-medium text-[var(--foreground)]">{s.name}: </span>
                  {s.text}
                </p>
              ))}
            </div>
          </>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={10}
        placeholder="Write your response here..."
        className="mt-3 w-full rounded-xl border border-[var(--border-c)] bg-white p-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--pink)]"
      />
      <p className={`mt-1 text-xs ${outOfRange ? "text-red-600" : "text-[var(--secondary)]"}`}>
        {count} words (target: {payload.word_min}–{payload.word_max})
      </p>
    </div>
  );
}
