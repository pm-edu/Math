import Link from "next/link";

export default function CtaBand() {
  return (
    <section className="bg-en-ink text-white">
      <div className="mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)] py-[clamp(46px,6vw,70px)] flex flex-wrap items-center justify-between gap-7">
        <div>
          <h2 className="text-[clamp(1.75rem,1.2rem+2.2vw,2.4rem)] font-extrabold tracking-[-.032em] max-w-[20ch] text-white">
            먼저 어디가 약한지부터 확인해 보세요
          </h2>
          <p className="mt-3 text-white/[.64] max-w-[44ch]">
            진단 결과는 신청 후 이틀 안에 리포트로 보내드립니다. 비용은 없습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sample"
            className="inline-flex items-center justify-center h-12 px-[22px] rounded-[11px] bg-en-gold text-en-ink text-[.9375rem] font-bold transition-colors hover:bg-en-gold-deep"
          >
            무료 진단 시작하기
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center h-12 px-[22px] rounded-[11px] border border-white/[.28] text-white text-[.9375rem] font-bold transition-colors hover:border-en-gold-soft hover:text-en-gold-soft"
          >
            수업 상담하기
          </Link>
        </div>
      </div>
    </section>
  );
}
