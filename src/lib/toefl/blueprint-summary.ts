import type { ToeflSection, ToeflStage } from "./types";

// 시간·문항수를 화면에 하드코딩하지 않고 toefl_form_blueprint에서 계산한다(spec §2 필수 요구사항).
// 순수 함수 — Supabase 접근은 호출자(entry 화면)가 이미 조회해온 행을 넘긴다.

export type BlueprintSummaryRow = {
  section: ToeflSection;
  stage: ToeflStage;
  time_limit_sec: number;
  item_count: number;
};

export type SectionSummary = { section: ToeflSection; timeSec: number; itemCount: number };

// 한 섹션에 stage2 행이 route(easy/hard)별로 여러 개 있어도, 학생은 그중 하나만 응시하므로
// 중복으로 더하지 않고 하나만 대표로 쓴다(현재 데이터는 easy/hard의 시간·문항수가 동일하게
// 설계돼 있음 — 표준화 시험의 공정성 요구상 자연스러운 전제).
export function summarizeBySection(rows: BlueprintSummaryRow[]): SectionSummary[] {
  const bySection = new Map<ToeflSection, { stage1?: BlueprintSummaryRow; stage2?: BlueprintSummaryRow }>();
  for (const row of rows) {
    const entry = bySection.get(row.section) ?? {};
    if (row.stage === "stage1" && !entry.stage1) entry.stage1 = row;
    if (row.stage === "stage2" && !entry.stage2) entry.stage2 = row;
    bySection.set(row.section, entry);
  }
  return Array.from(bySection.entries()).map(([section, { stage1, stage2 }]) => ({
    section,
    timeSec: (stage1?.time_limit_sec ?? 0) + (stage2?.time_limit_sec ?? 0),
    itemCount: (stage1?.item_count ?? 0) + (stage2?.item_count ?? 0),
  }));
}

export function totalSummary(rows: BlueprintSummaryRow[]): { timeSec: number; itemCount: number } {
  return summarizeBySection(rows).reduce(
    (sum, s) => ({ timeSec: sum.timeSec + s.timeSec, itemCount: sum.itemCount + s.itemCount }),
    { timeSec: 0, itemCount: 0 }
  );
}

export function formatDuration(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}
