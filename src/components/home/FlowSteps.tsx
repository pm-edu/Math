import { FLOW_STEPS } from "./data";

// 4단계 학습 흐름. 지시서 §5: 940px 이하 2×2, 600px 이하 1단.
export default function FlowSteps() {
  return (
    <section className="bg-en-card py-[clamp(58px,7vw,92px)]">
      <div className="mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)]">
        <div className="max-w-[52ch] mb-[clamp(30px,4vw,42px)]">
          <h2 className="text-[clamp(1.75rem,1.2rem+2.2vw,2.4rem)] font-extrabold tracking-[-.032em] text-en-ink">
            한 학기가 이렇게 굴러갑니다
          </h2>
          <p className="mt-3.5 text-[1.0625rem] leading-[1.7] text-en-ink-soft">
            수업만 듣고 끝나지 않도록, 진단에서 리포트까지 네 단계를 반복합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 min-[601px]:grid-cols-2 min-[941px]:grid-cols-4 border-t border-en-line">
          {FLOW_STEPS.map((step, i) => {
            const isRightTabletCol = i % 2 === 1; // 2단(601~940px)에서 오른쪽 칸
            const isTopTabletRow = i < 2; // 2단에서 윗줄(아랫줄과 구분선 필요)
            const isLastDesktopCol = i === FLOW_STEPS.length - 1; // 4단에서 맨 끝(구분선 불필요)
            return (
              <div
                key={step.no}
                className={[
                  "pt-[26px] pb-[30px] border-en-line",
                  "border-b last:border-b-0", // 1단(모바일): 아래쪽 구분선만
                  isTopTabletRow ? "min-[601px]:border-b" : "min-[601px]:border-b-0",
                  isRightTabletCol ? "min-[601px]:border-r-0 min-[601px]:pr-0" : "min-[601px]:border-r min-[601px]:pr-6",
                  "min-[941px]:border-b-0",
                  isLastDesktopCol ? "min-[941px]:border-r-0 min-[941px]:pr-0" : "min-[941px]:border-r min-[941px]:pr-6",
                ].join(" ")}
              >
              <div className="flex items-center gap-[9px] mb-3.5 text-[.8125rem] font-bold text-en-gold-deep font-[family-name:var(--font-en-num)]">
                <span style={{ fontFeatureSettings: '"tnum" 1' }}>{step.no}</span>
                <span aria-hidden="true" className="h-0.5 flex-1 bg-en-gold-soft" />
              </div>
                <h3 className="text-[1.3125rem] font-extrabold tracking-[-.032em] text-en-ink">{step.title}</h3>
                <p className="mt-2.5 text-[.9375rem] leading-[1.68] text-en-ink-soft">{step.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
