import { MATH_PROGRAMS } from "./data";
import ProgramRow from "./ProgramRow";

// 영어 카드(EnglishTrackCard)와 같은 셸 + 행 목록 구조. 예전엔 태그 칩 4개 + 버튼 하나로
// 훨씬 단순했는데, 두 카드 스타일이 서로 달라 보인다는 지적(2026-09-09)으로 통일함.
export default function MathTrackCard() {
  return (
    <div className="rounded-2xl bg-en-card border border-en-line shadow-[0_1px_2px_rgba(24,42,78,.05),0_8px_24px_rgba(24,42,78,.07)] pt-[26px] px-2 pb-2 flex flex-col">
      <div className="px-5 pb-[18px] border-b border-en-line/60">
        <h3 className="text-[1.6875rem] font-extrabold tracking-[-.032em] text-en-ink">수학</h3>
        <p className="mt-2.5 text-[.9375rem] text-en-ink-soft">
          개념부터 실전까지, 학년과 과정에 맞춘 커리큘럼으로 한 번에 잡습니다.
        </p>
      </div>

      <div className="flex flex-col">
        {MATH_PROGRAMS.map((program) => (
          <ProgramRow key={program.id} program={program} />
        ))}
      </div>
    </div>
  );
}
