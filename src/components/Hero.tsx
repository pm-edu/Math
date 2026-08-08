import Link from "next/link";

export default function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24 md:pb-28">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <span className="inline-block rounded-full bg-[var(--mint)] px-4 py-1.5 text-xs font-medium text-[var(--mint-dark)]">
            초 · 중 · 고 · IB 수학 전문
          </span>

          <h1 className="mt-5 text-4xl font-medium leading-tight text-[var(--foreground)] md:text-5xl">
            개념부터 실전까지,
            <br />
            한번에 잡는 수학
          </h1>

          <p className="mt-5 text-base leading-relaxed text-[var(--secondary)] md:text-lg">
            동영상 강의와 학습자료를 함께 제공하는 온라인 수학 클래스.
            <br />
            학년과 과정에 맞춘 커리큘럼으로 시작하세요.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/courses"
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.03]"
            >
              강좌 둘러보기
            </Link>
            <Link
              href="/sample"
              className="rounded-full border border-[var(--border-c)] bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
            >
              무료 샘플 보기
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="rounded-3xl bg-[var(--pink-light)] p-8 md:p-10">
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-xs font-medium text-[var(--secondary)]">이번 주 인기 강좌</p>
              <p className="mt-2 text-lg font-medium text-[var(--foreground)]">
                IB Math AA/AI 대비 종합반
              </p>
              <p className="mt-1 text-sm text-[var(--secondary)]">
                동영상 30강 + IA 작성 가이드
              </p>
              <div className="mt-4 h-2 w-full rounded-full bg-[var(--mint)]">
                <div className="h-2 w-2/3 rounded-full bg-[var(--pink)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
