// 원점수 → 영역점수(0-30) → 밴드(1.0-6.0) 변환. docs/toefl-spec.md §7.
// 순수 함수 — DB 접근 금지. rawToScaled는 "DB 변환표 조회"가 필요하다고 스펙에 적혀 있지만,
// 실제 조회(toefl_scale_conversion select)는 호출자(API 라우트)가 하고 그 결과 행만 인자로 넘긴다.

export type ScaleConversionRow = { raw_min: number; raw_max: number; scaled: number };

// raw는 "만점 대비 백분율(0~100)" 기준이다(마이그레이션 202608151202 주석과 동일 전제).
// 버킷은 raw_min 기준 계단함수로 판정한다(예: [0,8),[8,17),...) — 경계값 raw_min은 다음 구간 소속.
export function rawToScaled(rawPercent: number, rows: ScaleConversionRow[]): number {
  if (rows.length === 0) throw new Error("변환표(toefl_scale_conversion) 데이터가 없습니다.");
  const clamped = Math.min(100, Math.max(0, rawPercent));
  const sorted = [...rows].sort((a, b) => a.raw_min - b.raw_min);

  let matched = sorted[0];
  for (const row of sorted) {
    if (clamped >= row.raw_min) matched = row;
    else break;
  }
  return matched.scaled;
}

// 영역점수(0-30) → 밴드(1.0-6.0) 고정 대응표.
// spec §7의 표(migration 202608151202 시드값과 동일한 11단계)를 그대로 코드에 옮긴 것 —
// ETS 공식 대응표가 확정되면 이 표만 교체하면 된다(다른 함수는 안 바뀜).
const SCALED_TO_BAND: { minScaled: number; band: number }[] = [
  { minScaled: 0, band: 1.0 },
  { minScaled: 3, band: 1.5 },
  { minScaled: 6, band: 2.0 },
  { minScaled: 9, band: 2.5 },
  { minScaled: 12, band: 3.0 },
  { minScaled: 14, band: 3.5 },
  { minScaled: 17, band: 4.0 },
  { minScaled: 20, band: 4.5 },
  { minScaled: 23, band: 5.0 },
  { minScaled: 26, band: 5.5 },
  { minScaled: 29, band: 6.0 },
];

export function scaledToBand(scaled: number): number {
  const clamped = Math.min(30, Math.max(0, scaled));
  let matched = SCALED_TO_BAND[0].band;
  for (const row of SCALED_TO_BAND) {
    if (clamped >= row.minScaled) matched = row.band;
    else break;
  }
  return matched;
}

// easy 경로로 라우팅된 응시자는 최종 밴드가 4.0을 넘지 않는다(§8 4번 규칙).
export function applyRouteCap(band: number, route: "base" | "easy" | "hard"): number {
  return route === "easy" ? Math.min(band, 4.0) : band;
}

// 밴드(1.0-6.0) → CEFR 등급. spec §7 표 그대로("총점: ... 밴드 병기, 리포트에는 셋 다 표시").
const BAND_TO_CEFR: { minBand: number; cefr: string }[] = [
  { minBand: 1.0, cefr: "A1" },
  { minBand: 2.0, cefr: "A2" },
  { minBand: 3.0, cefr: "B1" },
  { minBand: 4.0, cefr: "B2" },
  { minBand: 5.0, cefr: "C1" },
  { minBand: 6.0, cefr: "C2" },
];

export function bandToCefr(band: number): string {
  const clamped = Math.min(6.0, Math.max(1.0, band));
  let matched = BAND_TO_CEFR[0].cefr;
  for (const row of BAND_TO_CEFR) {
    if (clamped >= row.minBand) matched = row.cefr;
    else break;
  }
  return matched;
}

// 밴드 숫자만으로는 학생이 "그래서 뭘 할 수 있다는 건지" 알기 어렵다는 게 리포트 화면 검토에서
// 나온 지적이라, CEFR 등급별 짧은 평문 설명을 붙인다. 학생 응시 화면은 영어만 쓴다(spec §14).
const CEFR_DESCRIPTION: Record<string, string> = {
  A1: "You can understand basic phrases and very simple exchanges.",
  A2: "You can follow short, simple texts and conversations on familiar topics.",
  B1: "You can follow the main points of clear, standard input on familiar matters.",
  B2: "You can follow most academic lectures and readings, with occasional gaps in fast or highly technical passages.",
  C1: "You can understand a wide range of demanding, longer academic texts and lectures.",
  C2: "You can understand virtually everything you read or hear with ease.",
};

export function bandDescription(band: number): string {
  return CEFR_DESCRIPTION[bandToCefr(band)];
}
