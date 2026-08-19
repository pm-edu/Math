"use client";

// 검수 편집기들이 함께 쓰는 조각들.
// 학생 화면의 TaskRenderer 와 같은 구조를 관리자 쪽에도 둔다 — spec §10
// "유형별 if문을 페이지에 흩뿌리지 않는다".

import type { ItemDraft } from "@/lib/toefl/server/generators/types";

export const inputClass =
  "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

/** 편집기가 받는 공통 props. onChange 는 바뀐 칸만 담아 올려보낸다. */
export type DraftEditorProps = {
  item: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <label className="block text-xs text-[var(--secondary)]">
        {label}
        {hint && <span className="ml-1.5 opacity-70">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export function TextArea({
  value,
  rows = 2,
  onChange,
  placeholder,
}: {
  value: string;
  rows?: number;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
  );
}

/** 4지선다 보기 + 정답 라디오. 객관식 계열 세 유형이 공유한다. */
export function OptionsEditor({ item, onChange }: DraftEditorProps) {
  const options = item.options ?? [];
  const correct = item.correct?.[0];

  return (
    <Field label="보기" hint="(정답을 라디오로 선택)">
      <div className="mt-1 space-y-2">
        {options.map((o, ci) => (
          <div key={o.id} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
              <input type="radio" checked={correct === o.id} onChange={() => onChange({ correct: [o.id] })} />
              {o.id}
            </label>
            <input
              type="text"
              value={o.text}
              onChange={(e) =>
                onChange({ options: options.map((x, xi) => (xi === ci ? { ...x, text: e.target.value } : x)) })
              }
              className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
        ))}
      </div>
    </Field>
  );
}

/**
 * 학생에게 보이면 안 되는 값을 편집할 때 붙이는 경고 띠.
 * 들려줄 문장·따라 말할 문장·인터뷰 질문은 음성으로만 전달되고 화면엔 안 나간다 —
 * 검수자가 그 사실을 알고 편집해야 "화면에 안 보이니 대충 써도 되겠지"가 안 생긴다.
 */
export function AudioOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 rounded-lg border border-[#F2DCAF] bg-[var(--en-gold-soft)] px-3 py-2 text-[11.5px] leading-relaxed text-[#8A5B00]">
      🔊 {children}
    </p>
  );
}
