import Link from "next/link";

// 2026-10-02 응급처치: "무료 진단 시작하기"(/sample) 버튼과 "이틀 안에 리포트" 약속 문구를 숨기고
// 상담 버튼만 남겼다 — 지금은 지킬 수 없는 약속이라. 사이트를 새로 지을 때 다시 설계한다.
export default function CtaBand() {
  return (
    <section className="bg-en-ink text-white">
      <div className="mx-auto max-w-[1160px] px-[clamp(20px,5vw,56px)] py-[clamp(46px,6vw,70px)] flex flex-wrap items-center justify-between gap-7">
        <div>
          <h2 className="text-[clamp(1.75rem,1.2rem+2.2vw,2.4rem)] font-extrabold tracking-[-.032em] max-w-[20ch] text-white">
            수업이 궁금하시면 편하게 문의하세요
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
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
