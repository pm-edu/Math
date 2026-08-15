// 여러 응답의 획득 점수를 합산한다. docs/toefl-spec.md §7.
// 순수 함수 — DB 접근 금지. 호출자가 이미 채점된(points_earned가 채워진) 응답 목록을 넘긴다.

import { round2 } from "./round";

export type AggregatableResponse = { points_earned: number | null };

export function aggregateRaw(responses: AggregatableResponse[]): number {
  return round2(responses.reduce((sum, r) => sum + (r.points_earned ?? 0), 0));
}
