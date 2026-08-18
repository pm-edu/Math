"use client";

import { useState } from "react";
import type { BuildASentencePayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 build_a_sentence: 조각(chunk)을 순서대로 배열해 문장을 완성한다. 요청(2026-08-18):
// 클릭 배치가 본체(접근성·모바일 대응 — <button>이라 키보드로도 그대로 조작 가능하다), 드래그는
// 보조. 이 프로젝트엔 dnd 라이브러리가 없어서(package.json 확인함) 새로 안 깔고 브라우저 내장
// HTML5 Drag&Drop API로 구현한다.
//
// 구두점("."/","  등)도 독립 카드다 — payload.chunks 자체가 원래 낱말/구두점 구분 없이 평평한
// 목록이라 데이터 구조는 그대로 두고(§6 계약 준수), 화면에 "완성된 문장"을 조립해 보여줄 때만
// 구두점 카드 앞에 공백을 안 붙이는 타이포그래피 처리를 한다.

function isPunctuationChunk(text: string): boolean {
  return /^[.,!?;:]$/.test(text.trim());
}

function assembleSentence(order: string[], chunkById: Map<string, { id: string; text: string }>): string {
  let out = "";
  for (const id of order) {
    const text = chunkById.get(id)?.text ?? "";
    if (!text) continue;
    if (out.length === 0 || isPunctuationChunk(text)) out += text;
    else out += ` ${text}`;
  }
  return out;
}

type DragPayload = { id: string; source: "pool" | "placed"; fromIndex?: number };

export default function BuildASentence({
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
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverPool, setDragOverPool] = useState(false);

  function append(id: string) {
    onChange({ order: [...order, id] });
  }
  function removeFrom(index: number) {
    onChange({ order: order.filter((_, i) => i !== index) });
  }
  function undo() {
    onChange({ order: order.slice(0, -1) });
  }
  function reset() {
    onChange({ order: [] });
  }

  function insertAt(id: string, index: number) {
    const next = [...order];
    next.splice(index, 0, id);
    onChange({ order: next });
  }
  function moveTo(fromIndex: number, toIndex: number) {
    const next = [...order];
    const [moved] = next.splice(fromIndex, 1);
    const adjusted = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(adjusted, 0, moved);
    onChange({ order: next });
  }

  function handleDragStart(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
  }

  function readDrag(e: React.DragEvent): DragPayload | null {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain")) as DragPayload;
    } catch {
      return null;
    }
  }

  function handleDropAt(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    setDragOverIndex(null);
    const data = readDrag(e);
    if (!data) return;
    if (data.source === "pool") insertAt(data.id, targetIndex);
    else if (data.fromIndex !== undefined) moveTo(data.fromIndex, targetIndex);
  }

  function handleDropOnPool(e: React.DragEvent) {
    e.preventDefault();
    setDragOverPool(false);
    const data = readDrag(e);
    if (data?.source === "placed" && data.fromIndex !== undefined) removeFrom(data.fromIndex);
  }

  const sentence = assembleSentence(order, chunkById);

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      {/* 배치 완료된 문장 — 상단에 크게 표시 */}
      <div
        aria-live="polite"
        className="mt-3 min-h-[3rem] rounded-xl border border-[var(--border-c)] bg-[var(--pink-light)]/20 px-4 py-3 text-xl font-medium text-[var(--foreground)]"
      >
        {sentence || <span className="text-base font-normal text-[var(--secondary)]">Your sentence will appear here.</span>}
      </div>

      {/* 배치 영역 — 순서대로 놓인 카드. 클릭하면 그 카드만 제거, 드래그로 순서도 바꿀 수 있다. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverIndex(order.length);
        }}
        onDragLeave={() => setDragOverIndex(null)}
        onDrop={(e) => handleDropAt(e, order.length)}
        className="mt-3 flex min-h-[3.5rem] flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--border-c)] bg-white p-4"
      >
        {order.length === 0 && <span className="text-sm text-[var(--secondary)]">Click (or drag) chunks below in order.</span>}
        {order.map((id, i) => (
          <button
            key={`${id}-${i}`}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, { id, source: "placed", fromIndex: i })}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIndex(i);
            }}
            onDrop={(e) => handleDropAt(e, i)}
            onClick={() => removeFrom(i)}
            title="Click to remove"
            className={`cursor-grab rounded-lg border px-3 py-1.5 text-sm text-[var(--foreground)] active:cursor-grabbing ${
              dragOverIndex === i ? "border-[var(--pink)] bg-[var(--pink-light)]/70" : "border-[var(--pink)] bg-[var(--pink-light)]/40"
            }`}
          >
            {chunkById.get(id)?.text}
          </button>
        ))}
        {dragOverIndex === order.length && order.length > 0 && (
          <span className="h-8 w-1 rounded bg-[var(--pink)]" aria-hidden="true" />
        )}
      </div>

      <div className="mt-2 flex gap-3 text-xs">
        <button type="button" onClick={undo} disabled={order.length === 0} className="text-[var(--secondary)] underline disabled:opacity-40">
          ↺ Undo
        </button>
        <button type="button" onClick={reset} disabled={order.length === 0} className="text-[var(--secondary)] underline disabled:opacity-40">
          Reset all
        </button>
      </div>

      {/* 남은 카드 풀 — 여기로 드래그해서 놓으면 배치에서 뺀다. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverPool(true);
        }}
        onDragLeave={() => setDragOverPool(false)}
        onDrop={handleDropOnPool}
        className={`mt-4 flex min-h-[3rem] flex-wrap gap-2 rounded-xl p-2 ${dragOverPool ? "bg-[var(--mint)]/20" : ""}`}
      >
        {remaining.map((c) => (
          <button
            key={c.id}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, { id: c.id, source: "pool" })}
            onClick={() => append(c.id)}
            className="cursor-grab rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/20 active:cursor-grabbing"
          >
            {c.text}
          </button>
        ))}
      </div>
    </div>
  );
}
