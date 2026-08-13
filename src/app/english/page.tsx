"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { loadPublishedUnits } from "@/lib/english/session-data";
import type { UnitSummary } from "@/lib/english/types";

// 새 단어를 막 다 훑은 시점엔 마스터리(Lv3 이상 비율)가 게이트 통과선(90%)에 한참 못 미친다
// (레벨업엔 서로 다른 세션 3회가 필요). 그 상태로 종합평가 버튼부터 보이면 도전→낙담을 반복하니,
// 마스터리가 이 정도는 쌓인 뒤에만 버튼을 노출한다.
const READY_FOR_TEST_THRESHOLD = 0.7;

export default function EnglishHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitSummary[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const list = await loadPublishedUnits(auth.user.id);
      setUnits(list);
      setLoading(false);
    }
    load();
  }, [router]);

  const totalDue = units.reduce((sum, u) => sum + u.dueCount, 0);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">영어 학습</h1>
        <p className="mt-2 text-[var(--secondary)]">
          채점 기반 완전학습입니다. 스스로 &quot;안다&quot;고 표시하는 게 아니라, 맞혀야만 다음 단계로 올라갑니다.
        </p>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : (
          <>
            <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--secondary)]">오늘 복습이 필요한 단어</p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{totalDue}개</p>
                </div>
                <Link
                  href="/english/review"
                  className={`rounded-full px-6 py-2.5 text-sm font-medium ${
                    totalDue > 0
                      ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                      : "border border-[var(--border-c)] bg-white text-[var(--secondary)]"
                  }`}
                >
                  복습 시작
                </Link>
              </div>
            </div>

            <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">단어장</h2>
            {units.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center text-sm text-[var(--secondary)]">
                아직 공개된 단어장이 없습니다.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {units.map((u) => {
                  const locked = u.status === "locked";
                  const passed = u.status === "passed";
                  const allEncountered = u.newCount === 0 && !passed;
                  const readyForTest = allEncountered && u.masteryRatio >= READY_FOR_TEST_THRESHOLD;
                  const stillBuildingMastery = allEncountered && !readyForTest;
                  return (
                    <li
                      key={u.id}
                      className={`rounded-2xl border bg-white p-5 ${locked ? "border-[var(--border-c)] opacity-50" : "border-[var(--border-c)]"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-[var(--secondary)]">{u.setTitleKo}</p>
                            {passed && (
                              <span className="rounded-full bg-[var(--mint)] px-2 py-0.5 text-[10px] font-medium text-[var(--mint-dark)]">통과</span>
                            )}
                            {locked && (
                              <span className="rounded-full border border-[var(--border-c)] px-2 py-0.5 text-[10px] text-[var(--secondary)]">🔒 잠김</span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-[var(--foreground)]">{u.title}</p>
                          <p className="mt-1 text-xs text-[var(--secondary)]">
                            전체 {u.wordCount} · 새 단어 {u.newCount} · 복습 필요 {u.dueCount}
                            {u.cycleCount > 0 && ` · 교정학습 ${u.cycleCount}회`}
                          </p>
                          {stillBuildingMastery && (
                            <p className="mt-1 text-xs text-[var(--secondary)]">
                              마스터리 {Math.round(u.masteryRatio * 100)}% · 복습을 더 하면 종합평가에 도전할 수 있어요
                            </p>
                          )}
                        </div>
                        {locked ? (
                          <span className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--secondary)]">이전 유닛부터</span>
                        ) : (
                          <div className="flex gap-2">
                            {u.newCount > 0 && (
                              <Link href={`/english/learn/${u.id}`} className="rounded-full bg-[var(--mint)] px-4 py-1.5 text-sm font-medium text-[var(--mint-dark)]">
                                새 단어 배우기
                              </Link>
                            )}
                            {readyForTest && (
                              <Link href={`/english/test/${u.id}`} className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-sm font-medium text-[var(--pink-dark)]">
                                종합평가
                              </Link>
                            )}
                            {stillBuildingMastery && (
                              <Link href="/english/review" className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)]">
                                복습하기
                              </Link>
                            )}
                            {passed && (
                              <Link href={`/english/test/${u.id}`} className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)]">
                                다시 평가
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
