// 히어로 우측 학습 리포트 카드. 지시서 §6: 숫자는 지금은 하드코딩 예시지만 나중에
// 실제 통계 뷰의 익명 샘플로 교체될 예정이라 props로 받는다. 기본값은 시안과 동일.
export interface ReportPreviewProps {
  studentName: string;
  className: string;
  band: number; // 1.0 ~ 6.0
  scaledScore: number; // 0 ~ 120
  units: { name: string; accuracy: number; weak?: boolean }[];
  focusUnit: string;
}

const DEFAULT_PROPS: ReportPreviewProps = {
  studentName: "김서연",
  className: "TOEFL 준비반",
  band: 4.5,
  scaledScore: 92,
  units: [
    { name: "Reading · 추론", accuracy: 88 },
    { name: "Listening · 태도 파악", accuracy: 74 },
    { name: "Writing · 근거 전개", accuracy: 52, weak: true },
  ],
  focusUnit: "Writing · 근거 전개",
};

export default function ReportPreview(props: Partial<ReportPreviewProps> = {}) {
  const { studentName, className, band, scaledScore, units, focusUnit } = { ...DEFAULT_PROPS, ...props };
  const bandPct = Math.min(100, Math.max(0, (band / 6) * 100));

  return (
    <div className="rounded-[18px] bg-en-card text-en-ink p-[26px] pb-[22px] shadow-[0_30px_60px_-32px_rgba(16,27,61,.65)]" aria-label="학습 리포트 예시">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[.8125rem] font-medium text-en-ink-soft">
          이번 주 리포트
          <b className="block mt-[3px] text-[1.0625rem] font-extrabold tracking-[-.03em] text-en-ink">
            {studentName} · {className}
          </b>
        </div>
        <div className="text-right leading-none">
          <div className="font-[family-name:var(--font-en-num)] text-[2.625rem] font-bold tracking-[-.045em] text-en-ink" style={{ fontFeatureSettings: '"tnum" 1' }}>
            {band.toFixed(1)}
          </div>
          <div className="mt-1.5 text-[.8125rem] font-semibold text-en-ink-soft font-[family-name:var(--font-en-num)]" style={{ fontFeatureSettings: '"tnum" 1' }}>
            Band · {scaledScore}/120
          </div>
        </div>
      </div>

      <div className="flex h-[7px] rounded-full overflow-hidden my-5 mb-1.5 bg-en-line">
        <span className="block h-full rounded-full bg-en-gold" style={{ width: `${bandPct}%` }} />
      </div>
      <div className="flex justify-between font-[family-name:var(--font-en-num)] text-[.6875rem] text-en-ink-soft/70" style={{ fontFeatureSettings: '"tnum" 1' }}>
        <span>1.0</span>
        <span>3.0</span>
        <span>4.5</span>
        <span>6.0</span>
      </div>

      <div className="mt-[22px] pt-[18px] border-t border-en-line text-[.8125rem] font-bold text-en-ink">단원별 정답률</div>

      {units.map((unit) => (
        <div key={unit.name} className="grid grid-cols-[1fr_46px] gap-[9px] items-center mb-[11px]">
          <div className="text-[.8125rem] font-semibold text-en-ink">{unit.name}</div>
          <div
            className="font-[family-name:var(--font-en-num)] text-[.8125rem] font-semibold text-right text-en-ink-soft"
            style={{ fontFeatureSettings: '"tnum" 1' }}
          >
            {unit.accuracy}%
          </div>
          <div className="col-span-2 h-1.5 rounded-full overflow-hidden bg-en-line">
            <span className={`block h-full rounded-full ${unit.weak ? "bg-en-gold" : "bg-en-ink"}`} style={{ width: `${unit.accuracy}%` }} />
          </div>
        </div>
      ))}

      <div className="mt-[18px] pt-3.5 border-t border-en-line flex items-center justify-between text-[.8125rem] text-en-ink-soft">
        <span>다음 주 집중 단원</span>
        <b className="font-bold text-en-gold-deep">{focusUnit}</b>
      </div>
    </div>
  );
}
