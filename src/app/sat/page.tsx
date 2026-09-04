"use client";

// SAT(디지털 SAT) 학생용 랜딩. TOEFL 랜딩(src/app/toefl/page.tsx)만큼 완성된 마케팅 페이지는
// 아니고, "화면 뼈대" 단계 — 지금 있는 유형별 연습(30개 스킬)으로 바로 들어가는 진입점이 핵심.
// 풀 모의고사·리포트 등은 다음 단계.

import Link from "next/link";
import SatHeader from "@/components/sat/SatHeader";
import { useLang } from "@/lib/i18n";
import { RW_SKILLS, MATH_SKILLS } from "@/lib/sat/taxonomy";

export default function SatLandingPage() {
  const { t } = useLang();

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--en-paper)]">
      <SatHeader />

      <section className="border-b border-[var(--en-line)] bg-[var(--en-ink)] px-6 py-16 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">디지털 SAT, 유형부터 정확히 잡습니다</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Reading & Writing과 Math를 각각 2개 모듈로 나눠 응시하는 실제 디지털 SAT 구조를 그대로 반영합니다.
            지금은 30개 세부 유형을 하나씩 연습할 수 있고, 풀 모의고사는 준비 중입니다.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="text-lg font-extrabold text-[var(--en-ink)]">Reading &amp; Writing — 11개 유형</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RW_SKILLS.map((s) => (
            <Link
              key={s.key}
              href={`/sat/practice/${s.key}`}
              className="rounded-xl border border-[var(--en-line)] bg-white px-4 py-3 text-sm font-medium text-[var(--en-ink)] transition-colors hover:border-[var(--en-gold)]"
            >
              {s.labelKo}
            </Link>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-extrabold text-[var(--en-ink)]">Math — 19개 유형</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MATH_SKILLS.map((s) => (
            <Link
              key={s.key}
              href={`/sat/practice/${s.key}`}
              className="rounded-xl border border-[var(--en-line)] bg-white px-4 py-3 text-sm font-medium text-[var(--en-ink)] transition-colors hover:border-[var(--en-gold)]"
            >
              {s.labelKo}
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-[var(--en-line)] px-6 py-6 text-center text-xs text-[var(--en-ink-soft)]">
        {t("sat_landing_footerCopyright")}
      </footer>
    </div>
  );
}
