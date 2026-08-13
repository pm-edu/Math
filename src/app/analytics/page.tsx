"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SentenceWritePractice from "@/components/english/SentenceWritePractice";
import { createClient } from "@/lib/supabase/client";
import {
  loadMasteryOverview,
  loadUpcomingReviewLoad,
  loadWeakWords,
  type MasteryOverview,
  type ReviewLoadDay,
  type WeakWord,
} from "@/lib/english/session-data";

const LEVEL_LABELS = ["미학습", "인지", "재인", "산출", "숙달", "완전숙달"];

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MasteryOverview | null>(null);
  const [overdue, setOverdue] = useState(0);
  const [reviewDays, setReviewDays] = useState<ReviewLoadDay[]>([]);
  const [weakWords, setWeakWords] = useState<WeakWord[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const [ov, load14, weak] = await Promise.all([
        loadMasteryOverview(auth.user.id),
        loadUpcomingReviewLoad(auth.user.id, 14),
        loadWeakWords(auth.user.id, 10),
      ]);
      setOverview(ov);
      setOverdue(load14.overdue);
      setReviewDays(load14.days);
      setWeakWords(weak);
      setLoading(false);
    }
    load();
  }, [router]);

  const maxDayCount = Math.max(1, ...reviewDays.map((d) => d.count));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">내 학습 통계</h1>
          <Link href="/english" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
            영어 학습으로 →
          </Link>
        </div>

        {loading || !overview ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : (
          <>
            {/* 요약 */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">배운 단어</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{overview.totalLearned}개</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">완전히 마스터한 단어</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--mint-dark)]">{overview.mastered}개</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">밀린 복습</p>
                <p className={`mt-1 text-2xl font-semibold ${overdue > 0 ? "text-[var(--pink-dark)]" : "text-[var(--foreground)]"}`}>
                  {overdue}개
                </p>
              </div>
            </div>

            {/* 숙련도 단계 분포 */}
            <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">숙련도 단계별 단어 수</h2>
            <div className="mt-3 space-y-2">
              {overview.byLevel.map((count, level) => {
                const max = Math.max(1, ...overview.byLevel);
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs text-[var(--secondary)]">
                      Lv{level} {LEVEL_LABELS[level]}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--mint)]/20">
                      <div
                        className="h-full rounded-full bg-[var(--mint)]"
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs text-[var(--secondary)]">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* 다가오는 복습량 */}
            <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">앞으로 14일 복습 예정</h2>
            <p className="mt-1 text-xs text-[var(--secondary)]">
              간격반복 스케줄이 특정 날짜에 몰리지 않는지 미리 확인하세요.
            </p>
            <div className="mt-3 flex items-end gap-1.5 overflow-x-auto pb-2">
              {reviewDays.map((d) => {
                const dateObj = new Date(d.date);
                const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
                return (
                  <div key={d.date} className="flex w-9 shrink-0 flex-col items-center gap-1">
                    <span className="text-[10px] text-[var(--secondary)]">{d.count || ""}</span>
                    <div
                      className="w-full rounded-t-md bg-[var(--pink)]"
                      style={{ height: `${8 + (d.count / maxDayCount) * 60}px` }}
                    />
                    <span className="text-[10px] text-[var(--secondary)]">{label}</span>
                  </div>
                );
              })}
            </div>

            {/* 약점 단어 */}
            <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">약점 단어 TOP {weakWords.length || 0}</h2>
            {weakWords.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
                아직 어려워하는 단어가 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {weakWords.map((w) => (
                  <div key={w.wordId} className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        {w.lemma}
                        {w.meaningKo && <span className="ml-2 font-normal text-[var(--secondary)]">{w.meaningKo}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--secondary)]">
                        Lv{w.level} {LEVEL_LABELS[w.level]} · 최근 연속오답 {w.consecutiveWrong}회
                      </p>
                    </div>
                    <div className="mt-2">
                      <SentenceWritePractice lemma={w.lemma} meaningKo={w.meaningKo} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
