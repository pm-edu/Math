import Link from "next/link";
import { MATH_CHIPS } from "./data";

export default function MathTrackCard() {
  return (
    <Link
      href="/courses"
      className="block rounded-2xl bg-en-gold-soft border border-en-gold/40 p-7 relative overflow-hidden transition-transform hover:-translate-y-0.5"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-en-gold" />

      <span className="w-[46px] h-[46px] rounded-[13px] bg-en-gold/15 text-en-gold-deep grid place-items-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6.5A2.5 2.5 0 0 1 4 19.5Z" />
          <path d="M8 8h7M8 12h4" />
        </svg>
      </span>

      <h3 className="mt-5 text-[1.6875rem] font-extrabold tracking-[-.032em] text-en-ink">수학</h3>
      <p className="mt-3 text-[.9375rem] leading-[1.7] text-en-ink-soft max-w-[30ch]">
        개념부터 실전까지, 학년과 과정에 맞춘 커리큘럼으로 한 번에 잡습니다.
      </p>

      <div className="mt-[22px] flex flex-wrap gap-2">
        {MATH_CHIPS.map((chip) => (
          <span key={chip} className="inline-flex items-center h-8 px-[13px] rounded-full bg-en-card border border-en-gold/40 text-[.8125rem] font-bold text-en-gold-deep">
            {chip}
          </span>
        ))}
      </div>

      <span className="mt-[26px] inline-flex items-center gap-1.5 rounded-[11px] bg-en-ink text-white h-12 px-[22px] text-[.9375rem] font-bold">
        수학 강좌 보기
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}
