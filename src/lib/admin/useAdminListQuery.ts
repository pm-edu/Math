"use client";

// admin 목록 탭(문제은행/영어단어/SAT 등) 공용 상태 관리 훅.
// 필터·정렬·상태필터·페이지·다중선택을 관리하고, list-query.ts로 실제 조회를 위임한다.
// 필터 상태는 URL 쿼리파라미터에 반영해 새로고침해도 유지된다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchManagedList,
  fetchStatusCounts,
  type EqFilter,
  type StatusCounts,
  type StatusMode,
} from "./list-query";

export type FilterFieldDef =
  | { key: string; label: string; kind: "select"; column: string; options: string[]; placeholder?: string }
  | { key: string; label: string; kind: "text"; column: string; placeholder?: string };

export type SortOptionDef = {
  value: string;
  label: string;
  column: string;
  ascending: boolean;
  nullsFirst?: boolean; // 예: "검수대기 우선" — 해당 컬럼이 null인 항목부터
};

export type UseAdminListQueryOptions = {
  // URL 쿼리파라미터 접두어. 한 화면에 여러 ManagedList를 쓸 경우를 대비해 탭마다 다르게(예: "prob", "word")
  paramPrefix: string;
  table: string;
  select?: string;
  // 항상 고정으로 적용되는 필터(예: subject='math') — 필터바에 노출되지 않음
  baseEq?: EqFilter[];
  filterDefs: FilterFieldDef[];
  // 상태 요약바/상태필터 기준 컬럼. null이면 상태 관련 기능을 아예 끈다.
  statusColumn: string | null;
  sortOptions: SortOptionDef[];
  pageSize?: number;
};

function readParams(prefix: string) {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function useAdminListQuery<T>(opts: UseAdminListQueryOptions) {
  const router = useRouter();
  const pageSize = opts.pageSize ?? 24;
  const key = useCallback((k: string) => `${opts.paramPrefix}_${k}`, [opts.paramPrefix]);

  const initial = readParams(opts.paramPrefix);
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    opts.filterDefs.forEach((d) => {
      f[d.key] = initial.get(key(d.key)) ?? "";
    });
    return f;
  });
  const [statusMode, setStatusMode] = useState<StatusMode>(
    (initial.get(key("status")) as StatusMode) || "all"
  );
  const [sortValue, setSortValue] = useState<string>(initial.get(key("sort")) || opts.sortOptions[0]?.value || "");
  const [page, setPage] = useState<number>(Number(initial.get(key("page"))) || 0);

  const [rows, setRows] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 필터/정렬/상태가 바뀌면 URL에 반영 + 1페이지로 (단, 필터 변경 자체가 아닌 page 자체 변경일 땐 유지)
  const syncUrl = useCallback(
    (next: { filters?: Record<string, string>; statusMode?: StatusMode; sortValue?: string; page?: number }) => {
      const params = readParams(opts.paramPrefix);
      const f = next.filters ?? filters;
      Object.entries(f).forEach(([k, v]) => {
        const paramKey = key(k);
        if (v) params.set(paramKey, v);
        else params.delete(paramKey);
      });
      const status = next.statusMode ?? statusMode;
      if (status !== "all") params.set(key("status"), status);
      else params.delete(key("status"));
      const sort = next.sortValue ?? sortValue;
      if (sort) params.set(key("sort"), sort);
      const p = next.page ?? page;
      if (p > 0) params.set(key("page"), String(p));
      else params.delete(key("page"));

      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [filters, statusMode, sortValue, page, key, opts.paramPrefix, router]
  );

  function setFilter(k: string, v: string) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    setPage(0);
    setSelected(new Set());
    syncUrl({ filters: next, page: 0 });
  }
  function clearFilters() {
    const next: Record<string, string> = {};
    opts.filterDefs.forEach((d) => (next[d.key] = ""));
    setFilters(next);
    setPage(0);
    setSelected(new Set());
    syncUrl({ filters: next, page: 0 });
  }
  function setStatus(mode: StatusMode) {
    setStatusMode(mode);
    setPage(0);
    setSelected(new Set());
    syncUrl({ statusMode: mode, page: 0 });
  }
  function setSort(value: string) {
    setSortValue(value);
    setPage(0);
    syncUrl({ sortValue: value, page: 0 });
  }
  function goToPage(p: number) {
    setPage(p);
    setSelected(new Set());
    syncUrl({ page: p });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const idsOnPage = (rows as unknown as { id: string }[]).map((r) => r.id);
      const allSelected = idsOnPage.every((id) => prev.has(id));
      const next = new Set(prev);
      idsOnPage.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const reqIdRef = useRef(0);
  const load = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const sort = opts.sortOptions.find((s) => s.value === sortValue) ?? opts.sortOptions[0];
      const eq: EqFilter[] = [...(opts.baseEq ?? [])];
      const ilike: { column: string; value: string }[] = [];
      opts.filterDefs.forEach((d) => {
        const v = filters[d.key];
        if (!v) return;
        if (d.kind === "select") eq.push({ column: d.column, value: v });
        else ilike.push({ column: d.column, value: v });
      });

      const [listResult, counts] = await Promise.all([
        fetchManagedList<T>({
          table: opts.table,
          select: opts.select,
          eq,
          ilike,
          statusColumn: opts.statusColumn ?? undefined,
          statusMode,
          sortColumn: sort?.column ?? "created_at",
          sortAscending: sort?.ascending ?? false,
          sortNullsFirst: sort?.nullsFirst ?? false,
          page,
          pageSize,
        }),
        opts.statusColumn
          ? fetchStatusCounts({ table: opts.table, eq, ilike, statusColumn: opts.statusColumn })
          : Promise.resolve(null),
      ]);

      if (myReqId !== reqIdRef.current) return; // 응답 늦게 온 이전 요청 무시(레이스 방지)
      setRows(listResult.rows);
      setTotalCount(listResult.totalCount);
      setStatusCounts(counts);
    } catch (e) {
      if (myReqId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.table, opts.select, opts.statusColumn, JSON.stringify(opts.baseEq), JSON.stringify(filters), statusMode, sortValue, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows,
    totalCount,
    statusCounts,
    loading,
    error,
    filters,
    setFilter,
    clearFilters,
    statusMode,
    setStatus,
    sortValue,
    setSort,
    page,
    pageSize,
    goToPage,
    selected,
    toggleSelect,
    toggleSelectAllOnPage,
    clearSelection,
    reload: load,
  };
}
