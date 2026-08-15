"use client";

import type { BuildASentencePayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 build_a_sentence: 조각(chunk)을 원하는 순서로 클릭해서 문장을 완성한다.
// 드래그앤드롭 대신 "클릭하면 뒤에 붙는다 / 완성된 조각을 클릭하면 다시 뺀다" 방식으로
// 라이브러리 없이 구현(정렬만 맞으면 되고 자유 드래그가 꼭 필요한 상호작용은 아님).

export default function BuildASentenceRenderer({
  item,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  value: { order?: string[] } | undefined;
  onChange: (answer: { order: string[] }) => void;
}) {
  const payload = item.payload as BuildASentencePayload;
  const order = value?.order ?? [];
  const chunkById = new Map(payload.chunks.map((c) => [c.id, c]));
  const remaining = payload.chunks.filter((c) => !order.includes(c.id));

  function append(id: string) {
    onChange({ order: [...order, id] });
  }
  function removeFrom(index: number) {
    onChange({ order: order.filter((_, i) => i !== index) });
  }
  function reset() {
    onChange({ order: [] });
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      <div className="mt-4 flex min-h-[3.5rem] flex-wrap items-center gap-2 rounded-xl border border-[var(--border-c)] bg-white p-4">
        {order.length === 0 && (
          <span className="text-sm text-[var(--secondary)]">Click the chunks below in order.</span>
        )}
        {order.map((id, i) => (
          <button
            key={`${id}-${i}`}
            type="button"
            onClick={() => removeFrom(i)}
            className="rounded-lg border border-[var(--pink)] bg-[var(--pink-light)]/40 px-3 py-1.5 text-sm text-[var(--foreground)]"
            title="Click to remove"
          >
            {chunkById.get(id)?.text}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {remaining.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => append(c.id)}
            className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/20"
          >
            {c.text}
          </button>
        ))}
      </div>

      {order.length > 0 && (
        <button type="button" onClick={reset} className="mt-3 text-xs text-[var(--secondary)] underline">
          Reset
        </button>
      )}
    </div>
  );
}
