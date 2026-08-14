"use client";

// admin 목록 탭(문제은행/영어단어/SAT 등) 공용 UI 조각들.
// 데이터를 직접 조회하지 않는다 — useAdminListQuery가 준 상태/콜백만 받아 그린다.
// 카드 자체(문제 미리보기 등)는 탭마다 다르므로 여기서 만들지 않고 호출부가 renderItem으로 넘긴다.

import type { FilterFieldDef, SortOptionDef } from "@/lib/admin/useAdminListQuery";
import type { StatusCounts, StatusMode } from "@/lib/admin/list-query";

export function SummaryCountBar({
  counts,
  statusMode,
  onStatusChange,
  presentLabel,
  absentLabel,
}: {
  counts: StatusCounts | null;
  statusMode: StatusMode;
  onStatusChange: (mode: StatusMode) => void;
  presentLabel: string;
  absentLabel: string;
}) {
  if (!counts) return null;
  const items: { mode: StatusMode; label: string; count: number }[] = [
    { mode: "all", label: "전체", count: counts.all },
    { mode: "absent", label: absentLabel, count: counts.absent },
    { mode: "present", label: presentLabel, count: counts.present },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.mode}
          onClick={() => onStatusChange(it.mode)}
          className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
            statusMode === it.mode
              ? "bg-[var(--pink)] text-[var(--pink-dark)]"
              : "border border-[var(--border-c)] bg-white text-[var(--secondary)] hover:bg-[var(--mint)]/20"
          }`}
        >
          {it.label} {it.count.toLocaleString()}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({
  defs,
  values,
  onChange,
  onClear,
}: {
  defs: FilterFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const hasActive = Object.values(values).some(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {defs.map((d) =>
        d.kind === "select" ? (
          <select
            key={d.key}
            value={values[d.key] ?? ""}
            onChange={(e) => onChange(d.key, e.target.value)}
            className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm"
          >
            <option value="">{d.placeholder ?? d.label}</option>
            {d.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={d.key}
            type="text"
            value={values[d.key] ?? ""}
            onChange={(e) => onChange(d.key, e.target.value)}
            placeholder={d.placeholder ?? d.label}
            className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm"
          />
        )
      )}
      {hasActive && (
        <button onClick={onClear} className="text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)]">
          필터 초기화
        </button>
      )}
    </div>
  );
}

export function SortSelect({
  options,
  value,
  onChange,
}: {
  options: SortOptionDef[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type BulkAction = { label: string; onClick: () => void; disabled?: boolean; tone?: "default" | "danger" };

export function BulkActionBar({
  selectedCount,
  actions,
  onClear,
}: {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-white px-5 py-3 shadow-lg">
      <span className="text-sm font-medium text-[var(--foreground)]">{selectedCount}개 선택됨</span>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          disabled={a.disabled}
          className={`rounded-full px-4 py-1.5 text-xs font-medium disabled:opacity-50 ${
            a.tone === "danger" ? "bg-red-100 text-red-600" : "bg-[var(--mint)] text-[var(--mint-dark)]"
          }`}
        >
          {a.label}
        </button>
      ))}
      <button onClick={onClear} className="ml-auto text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)]">
        선택 해제
      </button>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1 text-xs text-[var(--foreground)] disabled:opacity-40"
      >
        이전
      </button>
      <span className="text-xs text-[var(--secondary)]">
        {page + 1} / {totalPages} 페이지 · 전체 {totalCount.toLocaleString()}개
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1 text-xs text-[var(--foreground)] disabled:opacity-40"
      >
        다음
      </button>
    </div>
  );
}

export function SelectAllCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--secondary)]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--pink)]" />
      {label}
    </label>
  );
}
