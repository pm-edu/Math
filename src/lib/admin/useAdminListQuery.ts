"use client";

// admin 목록 탭(문제은행/수강신청 등) 공용 상태 관리 훅.
// 필터·정렬·상태필터·페이지·다중선택을 관리하고, list-query.ts로 실제 조회를 위임한다.
// 필터 상태는 URL 쿼리파라미터에 반영해 새로고침해도 유지된다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchManagedList,
  fetchStatusCounts,
  type EqFilter,
  type StatusCountOption,
} from "./list-query";

export type SelectOption = { value: string; label: string };

export type FilterFieldDef =
  | { key: string; label: string; kind: "select"; column: string; options: SelectOption[]; placeholder?: string }
  | { key: string; label: string; kind: "text"; column: string; placeholder?: string };

export type SortOptionDef = {
  value: string;
  label: string;
  column: string;
  ascending: boolean;
  nullsFirst?: boolean; // 예: "검수대기 우선" — 해당 컬럼이 null인 항목부터
};

export type UseAdminListQueryOptions = {
  // URL 쿼리파라미터 접두어. 한 화면에 여러 ManagedList를 쓸 경우를 대비해 탭마다 다르게(예: "prob", "enroll")
  paramPrefix: string;
  table: string;
  select?: string;
  // 항상 고정으로 적용되는 필터(예: subject='math') — 필터바에 노출되지 않음
  baseEq?: EqFilter[];
  filterDefs: FilterFieldDef[];
  // 요약 카운트바/상태필터 옵션. 첫 항목이 기본 선택값이 된다(보통 "전체").
  // 빈 배열이면 상태 관련 기능을 아예 끈다.
  statusOptions: StatusCountOption[];
  sortOptions: SortOptionDef[];
  pageSize?: number;
};

function readParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function useAdminListQuery<T>(opts: UseAdminListQueryOptions) {
  const router = useRouter();
  const pageSize = opts.pageSize ?? 24;
  const key = useCallback((k: string) => `${opts.paramPrefix}_${k}`, [opts.paramPrefix]);
  const defaultStatusKey = opts.statusOptions[0]?.key ?? "all";

  const initial = readParams();
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    opts.filterDefs.forEach((d) => {
      f[d.key] = initial.get(key(d.key)) ?? "";
    });
    return f;
  });
  const [statusKey, setStatusKey] = useState<string>(initial.get(key("status")) || defaultStatusKey);
  const [sortValue, setSortValue] = useState<string>(initial.get(key("sort")) || opts.sortOptions[0]?.value || "");
  const [page, setPage] = useState<number>(Number(initial.get(key("page"))) || 0);

  const [rows, setRows] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const syncUrl = useCallback(
    (next: { filters?: Record<string, string>; statusKey?: string; sortValue?: string; page?: number }) => {
      const params = readParams();
      const f = next.filters ?? filters;
      Object.entries(f).forEach(([k, v]) => {
        const paramKey = key(k);
        if (v) params.set(paramKey, v);
        else params.delete(paramKey);
      });
      const status = next.statusKey ?? statusKey;
      if (status !== defaultStatusKey) params.set(key("status"), status);
      else params.delete(key("status"));
      const sort = next.sortValue ?? sortValue;
      if (sort) params.set(key("sort"), sort);
      const p = next.page ?? page;
      if (p > 0) params.set(key("page"), String(p));
      else params.delete(key("page"));

      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [filters, statusKey, sortValue, page, key, defaultStatusKey, router]
  );

  function setFilter(k: string, v: string) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    setPage(0);
    setSelected(new Set());
    syncUrl({ filters: next, page: 0 });
  }
  // 여러 필터 키를 한 번에 바꿀 때(예: 종속 드롭다운 1차 변경 시 2차를 같이 초기화) —
  // setFilter를 연달아 두 번 부르면 둘 다 같은 이전 filters 스냅샷 기준이라 뒤 호출이 앞 호출을 덮어씀.
  function setFilterFields(patch: Record<string, string>) {
    const next = { ...filters, ...patch };
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
  function setStatus(k: string) {
    setStatusKey(k);
    setPage(0);
    setSelected(new Set());
    syncUrl({ statusKey: k, page: 0 });
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
      const statusOpt = opts.statusOptions.find((s) => s.key === statusKey);

      const [listResult, counts] = await Promise.all([
        fetchManagedList<T>({
          table: opts.table,
          select: opts.select,
          eq,
          ilike,
          status: statusOpt?.status,
          sortColumn: sort?.column ?? "created_at",
          sortAscending: sort?.ascending ?? false,
          sortNullsFirst: sort?.nullsFirst,
          page,
          pageSize,
        }),
        opts.statusOptions.length > 0
          ? fetchStatusCounts({ table: opts.table, eq, ilike, options: opts.statusOptions })
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
  }, [
    opts.table,
    opts.select,
    JSON.stringify(opts.statusOptions),
    JSON.stringify(opts.baseEq),
    JSON.stringify(filters),
    statusKey,
    sortValue,
    page,
    pageSize,
  ]);

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
    setFilterFields,
    clearFilters,
    statusKey,
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
