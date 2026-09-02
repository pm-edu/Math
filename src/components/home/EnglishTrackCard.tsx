import { PROGRAMS } from "./data";
import ProgramRow from "./ProgramRow";

export default function EnglishTrackCard() {
  return (
    <div className="rounded-2xl bg-en-card border border-en-line shadow-[0_1px_2px_rgba(24,42,78,.05),0_8px_24px_rgba(24,42,78,.07)] pt-[26px] px-2 pb-2 flex flex-col">
      <div className="px-5 pb-[18px] border-b border-en-line/60">
        <h3 className="text-[1.6875rem] font-extrabold tracking-[-.032em] text-en-ink">영어</h3>
        <p className="mt-2.5 text-[.9375rem] text-en-ink-soft">
          시험 대비부터 기초 회화·단어까지, 목적에 맞는 프로그램을 골라 시작하세요.
        </p>
      </div>

      <div className="flex flex-col">
        {PROGRAMS.map((program) => (
          <ProgramRow key={program.id} program={program} />
        ))}
      </div>
    </div>
  );
}
