// 여러 admin 탭(문제은행/수강신청 등)이 공유하는 "목록 조회" 순수 로직.
// Supabase 쿼리를 필터·정렬·페이지네이션으로 변환하는 부분만 담당한다.
// UI는 components/admin/ManagedList.tsx, 화면별 상태 관리는 useAdminListQuery.ts.

import { createClient } from "@/lib/supabase/client";

export type EqFilter = { column: string; value: string };
export type IlikeFilter = { column: string; value: string };

// 탭마다 "상태" 개념이 다르다 — 문제은행은 컬럼이 채워졌는지(풀이 유무),
// 수강신청은 여러 값 중 하나(pending/paid/refunded)다. 셋 다 이 타입 하나로 표현한다.
export type StatusConfig =
  | { kind: "none" } // 상태 필터 없음(전체)
  | { kind: "value"; column: string; value: string } // column = value
  | { kind: "isNull"; column: string } // column이 비어있음
  | { kind: "notNull"; column: string }; // column이 채워짐

export type StatusCountOption = { key: string; label: string; status: StatusConfig };

export type ListQueryInput = {
  table: string;
  select?: string; // 기본 "*"
  eq?: EqFilter[]; // 고정 필터(과목 등) + 사용자가 고른 select형 필터 전부 여기로
  ilike?: IlikeFilter[]; // 텍스트 부분일치 검색
  status?: StatusConfig;
  sortColumn: string;
  sortAscending: boolean;
  sortNullsFirst?: boolean; // 예: "검수대기 우선" — null인 것부터 보여줌
  page: number; // 0-based
  pageSize: number;
};

export type ListQueryResult<T> = { rows: T[]; totalCount: number };

// Supabase 쿼리빌더 체인은 테이블마다 제네릭 타입이 달라 여러 테이블에 공용으로
// 쓰려면 어쩔 수 없이 느슨한 타입이 필요하다 — 이 파일 밖으로는 노출되지 않는다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

function applyStatus(query: AnyQuery, status?: StatusConfig): AnyQuery {
  if (!status || status.kind === "none") return query;
  if (status.kind === "value") return query.eq(status.column, status.value);
  if (status.kind === "isNull") return query.is(status.column, null);
  return query.not(status.column, "is", null); // notNull
}

function applyFilters(query: AnyQuery, input: Pick<ListQueryInput, "eq" | "ilike" | "status">): AnyQuery {
  let q = query;
  (input.eq ?? []).forEach((f) => {
    if (f.value) q = q.eq(f.column, f.value);
  });
  (input.ilike ?? []).forEach((f) => {
    if (f.value) q = q.ilike(f.column, `%${f.value}%`);
  });
  q = applyStatus(q, input.status);
  return q;
}

export async function fetchManagedList<T>(input: ListQueryInput): Promise<ListQueryResult<T>> {
  const supabase = createClient();
  let query = supabase.from(input.table).select(input.select ?? "*", { count: "exact" });
  query = applyFilters(query, input);
  query = query.order(input.sortColumn, {
    ascending: input.sortAscending,
    nullsFirst: input.sortNullsFirst ?? false,
  });
  const from = input.page * input.pageSize;
  const to = from + input.pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as T[], totalCount: count ?? 0 };
}

// 요약 카운트바용: 상태 필터를 제외한 나머지 필터를 적용한 채로, 넘겨준 상태 옵션마다 개수를 센다.
export async function fetchStatusCounts(
  input: Pick<ListQueryInput, "table" | "eq" | "ilike"> & { options: StatusCountOption[] }
): Promise<Record<string, number>> {
  const supabase = createClient();

  async function countFor(status: StatusConfig): Promise<number> {
    let query = supabase.from(input.table).select("id", { count: "exact", head: true });
    query = applyFilters(query, { eq: input.eq, ilike: input.ilike, status });
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  const entries = await Promise.all(
    input.options.map(async (opt) => [opt.key, await countFor(opt.status)] as const)
  );
  return Object.fromEntries(entries);
}
