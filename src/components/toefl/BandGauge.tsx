// 밴드(1.0~6.0)를 숫자만 던지지 않고 눈금으로 보여주는 순수 표시용 컴포넌트(요청, report 화면).
// 0.5 단위 눈금 11개, 굵은 눈금은 정수 밴드(1~6)에만. 채워진 막대 끝에 있는 위치가 현재 밴드.

const MIN_BAND = 1.0;
const MAX_BAND = 6.0;
const TICKS: number[] = [];
for (let b = MIN_BAND; b <= MAX_BAND + 1e-9; b += 0.5) TICKS.push(Math.round(b * 10) / 10);

const TRACK_X0 = 12;
const TRACK_X1 = 308;
const TRACK_WIDTH = TRACK_X1 - TRACK_X0;

function bandToX(band: number): number {
  const clamped = Math.min(MAX_BAND, Math.max(MIN_BAND, band));
  return TRACK_X0 + ((clamped - MIN_BAND) / (MAX_BAND - MIN_BAND)) * TRACK_WIDTH;
}

export default function BandGauge({ band }: { band: number }) {
  const fillX = bandToX(band);
  const hasBand = band > 0;

  return (
    <svg
      viewBox="0 0 320 46"
      className="w-full"
      role="img"
      aria-label={hasBand ? `Band ${band} out of 6.0` : "Band not yet available"}
    >
      {/* 트랙 */}
      <line x1={TRACK_X0} y1={20} x2={TRACK_X1} y2={20} stroke="var(--border-c)" strokeWidth={4} strokeLinecap="round" />
      {/* 채워진 구간 */}
      {hasBand && (
        <line x1={TRACK_X0} y1={20} x2={fillX} y2={20} stroke="var(--pink)" strokeWidth={4} strokeLinecap="round" />
      )}
      {/* 눈금 + 라벨(정수만) */}
      {TICKS.map((t) => {
        const x = bandToX(t);
        const major = Number.isInteger(t);
        return (
          <g key={t}>
            <line x1={x} y1={major ? 12 : 15} x2={x} y2={28} stroke="var(--border-c)" strokeWidth={major ? 1.5 : 1} />
            {major && (
              <text x={x} y={42} fontSize={9} textAnchor="middle" fill="var(--secondary)">
                {t.toFixed(1)}
              </text>
            )}
          </g>
        );
      })}
      {/* 현재 밴드 마커 */}
      {hasBand && <circle cx={fillX} cy={20} r={6} fill="var(--pink-dark)" stroke="white" strokeWidth={2} />}
    </svg>
  );
}
