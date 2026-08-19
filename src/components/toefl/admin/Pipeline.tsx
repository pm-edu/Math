"use client";

// 문항 파이프라인 위치 표시 (docs/toefl-admin.html 의 .pipe).
// 지금 화면이 5단계 중 어디인지 알려주는 순수 표시용 — 클릭 이동은 사이드바가 맡는다.

const STEPS = ["생성", "검수", "세트 구성", "배포", "응시·리포트"] as const;
export type PipelineStep = (typeof STEPS)[number];

export default function Pipeline({ here }: { here: PipelineStep[] }) {
  return (
    <div className="mb-[18px] flex flex-wrap text-xs font-bold" aria-label="문항 파이프라인 위치">
      {STEPS.map((s, i) => {
        const on = here.includes(s);
        const first = i === 0;
        const last = i === STEPS.length - 1;
        return (
          <span
            key={s}
            aria-current={on ? "step" : undefined}
            className={`flex items-center gap-[7px] border border-[var(--en-line)] px-3.5 py-[7px] ${
              first ? "rounded-l-[9px]" : "-ml-px"
            } ${last ? "rounded-r-[9px]" : ""} ${
              on ? "border-[#F2DCAF] bg-[var(--en-gold-soft)] text-[#8A5B00]" : "bg-white text-[var(--en-ink-soft)]"
            }`}
          >
            <span
              className={`num rounded-[5px] px-1.5 text-[10.5px] ${
                on ? "bg-[var(--en-gold)] text-[var(--en-on-gold)]" : "bg-[#EFF3FA]"
              }`}
            >
              {i + 1}
            </span>
            {s}
          </span>
        );
      })}
    </div>
  );
}
