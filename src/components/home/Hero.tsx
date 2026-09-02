import Link from "next/link";
import ReportPreview from "./ReportPreview";

const TAGS = ["초등 · 중등 · 고등", "IB AA / AI", "TOEFL iBT", "1:1 · 소수정예"];

export default function Hero() {
  return (
    <section className="bg-en-ink text-white relative overflow-hidden">
      {/* 은은한 가로줄 텍스처 — 순수 장식, 스크린리더 대상 아님(배경이라 aria 불필요). */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,.04) 0 1px, transparent 1px 34px)",
          maskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 70%, transparent)",
        }}
      />

      <div className="relative mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)] grid grid-cols-1 min-[941px]:grid-cols-[1.06fr_.94fr] gap-[clamp(32px,5vw,68px)] items-center py-[clamp(54px,7vw,88px)] min-[941px]:py-[clamp(60px,8vw,96px)]">
        <div className="motion-safe:animate-[rise_.62s_cubic-bezier(0.2,0.7,0.3,1)_both]">
          <h1 className="break-keep text-[clamp(2.1rem,1.3rem+3.6vw,3.4rem)] font-extrabold tracking-[-.032em] leading-[1.24] text-white">
            학년이 달라도 시험이 달라도
            <span className="block">공부는 한 곳에서.</span>
          </h1>
          <p className="mt-5 max-w-[38ch] text-[1.0625rem] leading-[1.72] text-white/70">
            IGCSE·A-Level·IB 수학부터 2026 개편 TOEFL까지. 진단으로 시작해 매주 리포트로 확인하는 온라인 클래스입니다.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sample"
              className="inline-flex items-center justify-center h-12 px-[22px] rounded-[11px] bg-en-gold text-en-ink text-[.9375rem] font-bold transition-colors hover:bg-en-gold-deep"
            >
              무료 진단 시작하기
            </Link>
            <Link
              href="#tracks"
              className="inline-flex items-center justify-center h-12 px-[22px] rounded-[11px] border border-white/[.28] text-white text-[.9375rem] font-bold transition-colors hover:border-en-gold-soft hover:text-en-gold-soft"
            >
              강좌 둘러보기
            </Link>
          </div>

          <div className="mt-[34px] pt-6 border-t border-white/[.13] flex flex-wrap gap-2.5">
            {TAGS.map((tag) => (
              <span key={tag} className="inline-flex items-center h-[30px] px-3 rounded-full border border-white/20 text-[.8125rem] font-medium text-white/[.78]">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="motion-safe:animate-[rise_.62s_cubic-bezier(0.2,0.7,0.3,1)_both] motion-safe:[animation-delay:.1s]">
          <ReportPreview />
        </div>
      </div>
    </section>
  );
}
