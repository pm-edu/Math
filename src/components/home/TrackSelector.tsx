import MathTrackCard from "./MathTrackCard";
import EnglishTrackCard from "./EnglishTrackCard";

// 수학/영어 2단 래퍼. 지시서 §3: 그리드 비율 0.86fr:1.14fr(영어가 넓다 — 정보량이
// 많아서), 940px 이하에서 1단으로 바뀐다.
export default function TrackSelector() {
  return (
    <section className="py-[clamp(58px,7vw,92px)]">
      <div className="mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)]">
        <div className="max-w-[52ch] mb-[clamp(30px,4vw,42px)]">
          <h2 className="text-[clamp(1.75rem,1.2rem+2.2vw,2.4rem)] font-extrabold tracking-[-.032em] text-en-ink">
            무엇을 준비하고 계신가요?
          </h2>
          <p className="mt-3.5 text-[1.0625rem] leading-[1.7] text-en-ink-soft">
            과목을 고르면 학년과 시험에 맞는 커리큘럼을 보여드립니다.
          </p>
        </div>

        <div className="grid grid-cols-1 min-[941px]:grid-cols-[0.86fr_1.14fr] gap-[22px] items-start">
          <MathTrackCard />
          <EnglishTrackCard />
        </div>
      </div>
    </section>
  );
}
