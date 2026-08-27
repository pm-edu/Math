// 원점수 → 영역점수(0-30) → 밴드(1.0-6.0) 변환. docs/toefl-spec.md §7.
// 순수 함수 — DB 접근 금지. rawToScaled는 "DB 변환표 조회"가 필요하다고 스펙에 적혀 있지만,
// 실제 조회(toefl_scale_conversion select)는 호출자(API 라우트)가 하고 그 결과 행만 인자로 넘긴다.

export type ScaleConversionRow = { raw_min: number; raw_max: number; scaled: number };

// raw는 "만점 대비 백분율(0~100)" 기준이다(마이그레이션 202608151202 주석과 동일 전제).
// 버킷은 raw_min 기준 계단함수로 판정한다(예: [0,8),[8,17),...) — 경계값 raw_min은 다음 구간 소속.
//
// raw_max는 이전엔 조회에 전혀 안 쓰이고 버려졌다(2026-08-27 교차검증 지적) — 구간이 비거나
// 겹쳐도 조용히 넘어가는 문제가 있었다. 이제 정렬 후 앞 구간의 raw_max가 다음 구간의 raw_min과
// 정확히 이어지는지 검증하고, 안 맞으면 "변환표 데이터 자체가 잘못됐다"는 뜻이므로 바로 던진다
// (잘못된 시드로 조용히 틀린 점수를 내는 것보다, 여기서 시끄럽게 실패하는 게 낫다).
export function rawToScaled(rawPercent: number, rows: ScaleConversionRow[]): number {
  if (rows.length === 0) throw new Error("변환표(toefl_scale_conversion) 데이터가 없습니다.");
  const sorted = [...rows].sort((a, b) => a.raw_min - b.raw_min);

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].raw_max !== sorted[i].raw_min) {
      throw new Error(
        `변환표(toefl_scale_conversion) 구간이 이어지지 않습니다: ` +
          `${sorted[i - 1].raw_min}-${sorted[i - 1].raw_max} 다음 구간이 ${sorted[i].raw_min}에서 ` +
          `시작합니다(${sorted[i - 1].raw_max}에서 이어져야 합니다). 공백 또는 중첩된 시드 데이터를 확인하세요.`
      );
    }
  }

  const clamped = Math.min(100, Math.max(0, rawPercent));
  let matched = sorted[0];
  for (const row of sorted) {
    if (clamped >= row.raw_min) matched = row;
    else break;
  }
  return matched.scaled;
}

// 영역점수(0-30) → 밴드(1.0-6.0). 예전엔 spec §7 표를 코드에 SCALED_TO_BAND로 따로 하드코딩해
// 뒀는데, toefl_scale_conversion 테이블(주석 그대로 "점수 변환표 — 하드코딩 금지")이 이미 같은
// (scaled, band) 쌍을 갖고 있어서 결국 같은 데이터가 두 곳에 있었다 — 시드를 고치면 코드는 안
// 고쳐지는 식으로 어긋날 수 있다(실제로 scaled 최댓값이 시드는 29인데 표는 30이어야 하는 불일치가
// 있었음, 2026-08-27 교차검증). 이제 rawToScaled와 같은 방식으로 호출자가 조회한 행을 받는다.
export type BandLookupRow = { scaled: number; band: number };

export function scaledToBand(scaled: number, rows: BandLookupRow[]): number {
  if (rows.length === 0) throw new Error("변환표(toefl_scale_conversion) 데이터가 없습니다.");
  const sorted = [...rows].sort((a, b) => a.scaled - b.scaled);
  const clamped = Math.min(30, Math.max(0, scaled));
  let matched = sorted[0].band;
  for (const row of sorted) {
    if (clamped >= row.scaled) matched = row.band;
    else break;
  }
  return matched;
}

// easy 경로로 라우팅된 응시자는 최종 밴드가 4.0을 넘지 않는다(§8 4번 규칙).
export function applyRouteCap(band: number, route: "base" | "easy" | "hard"): number {
  return route === "easy" ? Math.min(band, 4.0) : band;
}

// 밴드(1.0-6.0) → CEFR 등급. spec §7 표 그대로("총점: ... 밴드 병기, 리포트에는 셋 다 표시").
// scaledToBand와 같은 이유로 하드코딩을 걷어내고 toefl_scale_conversion.cefr 컬럼(마이그레이션
// 202608271200)에서 조회한 행을 받는다.
export type CefrLookupRow = { band: number; cefr: string };

export function bandToCefr(band: number, rows: CefrLookupRow[]): string {
  if (rows.length === 0) throw new Error("변환표(toefl_scale_conversion) 데이터가 없습니다.");
  const sorted = [...rows].sort((a, b) => a.band - b.band);
  const clamped = Math.min(6.0, Math.max(1.0, band));
  let matched = sorted[0].cefr;
  for (const row of sorted) {
    if (clamped >= row.band) matched = row.cefr;
    else break;
  }
  return matched;
}

// 밴드 숫자만으로는 학생이 "그래서 뭘 할 수 있다는 건지" 알기 어렵다는 게 리포트 화면 검토에서
// 나온 지적이라, CEFR 등급별 짧은 평문 설명을 붙인다. 리포트는 안내 화면이라 언어 토글 대상이고
// (2026-08-18), 시험 응시 화면(§14)과는 별개다 — 그래서 en/ko 둘 다 여기 순수함수로 갖고 있는다
// (컴포넌트 쪽 DICT로 옮기지 않은 이유: bandToCefr 매핑과 함께 있어야 값이 어긋날 일이 없어서).
const CEFR_DESCRIPTION_EN: Record<string, string> = {
  A1: "You can understand basic phrases and very simple exchanges.",
  A2: "You can follow short, simple texts and conversations on familiar topics.",
  B1: "You can follow the main points of clear, standard input on familiar matters.",
  B2: "You can follow most academic lectures and readings, with occasional gaps in fast or highly technical passages.",
  C1: "You can understand a wide range of demanding, longer academic texts and lectures.",
  C2: "You can understand virtually everything you read or hear with ease.",
};

const CEFR_DESCRIPTION_KO: Record<string, string> = {
  A1: "기본적인 표현과 아주 간단한 대화를 이해할 수 있습니다.",
  A2: "익숙한 주제의 짧고 간단한 글과 대화를 따라갈 수 있습니다.",
  B1: "익숙한 주제라면 명확하고 표준적인 내용의 핵심을 따라갈 수 있습니다.",
  B2: "대부분의 학술 강의와 읽기 자료를 따라갈 수 있으며, 빠르거나 전문적인 부분에서만 가끔 놓칠 수 있습니다.",
  C1: "까다롭고 긴 학술 텍스트와 강의도 폭넓게 이해할 수 있습니다.",
  C2: "읽거나 듣는 거의 모든 내용을 어려움 없이 이해할 수 있습니다.",
};

export function bandDescription(band: number, rows: CefrLookupRow[], lang: "en" | "ko" = "en"): string {
  const cefr = bandToCefr(band, rows);
  return (lang === "ko" ? CEFR_DESCRIPTION_KO : CEFR_DESCRIPTION_EN)[cefr];
}
