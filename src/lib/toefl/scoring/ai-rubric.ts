// ai_rubric로 채점되는 문항(write_an_email/academic_discussion/take_an_interview)의 AI 판정
// 결과(overall_band, 1.0~6.0)를 다른 자동채점 문항과 같은 raw score 파이프라인에 태우기 위한 변환.
// spec §7의 aggregateRaw/rawToScaled는 "만점 대비 비율"을 전제로 하므로, band를 만점(6.0) 대비
// 비율로 바꿔 item.points에 곱한다. 순수 함수 — DB/네트워크 접근 없음.

const MAX_BAND = 6.0;

export function aiRubricToPoints(overallBand: number, itemPoints: number): number {
  const ratio = Math.min(1, Math.max(0, overallBand / MAX_BAND));
  return Math.round(ratio * itemPoints * 100) / 100;
}
