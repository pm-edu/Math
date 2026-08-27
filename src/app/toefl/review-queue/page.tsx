"use client";

// TOEFL 전용 복습 플레이어. 3차 화면 검토(2026-08-27) [B] — "복습 큐에 추가"가 기존 영어단어
// FSRS 엔진(/english/review)으로 가던 것을, 사용자가 "TOEFL 전용 복습 플레이어 신설"로
// 직접 결정해 완전히 새로 만들었다.
//
// 1차 버전 스코프(README처럼 여기 적어둔다 — 다음에 이어할 사람을 위해):
// - 데이터: GET /api/toefl/review-queue(최근 오답 문항, 최대 20개, 중복 제거) — 상세는 그 파일 주석.
// - 화면: report/[attemptId]/review와 완전히 같은 ReviewItemCard를 재사용한다(문항 유형별
//   렌더링을 새로 안 만듦) — 다만 그 화면은 "한 번의 응시" 안의 전체 문항(정답 포함)을 쭉
//   보여주는 목적이고, 여기는 "여러 응시에 걸친 오답만" 모아 보여주는 목적이라 섹션별로만
//   묶고 개별 attempt/시간 정보는 안 보여준다(응답 자체엔 attempt_id를 안 내려주므로).
// - 없는 것(의도적으로 다음으로 미룸): 간격반복 스케줄링(다시 맞히면 큐에서 빠지는 것도 없음 —
//   매번 다시 불러도 "최근 오답 20개"가 그대로 나온다), "복습 완료" 표시/진도 저장.
//   1차 목표는 "오답을 다시 보여주는 것" 자체이고, 스케줄링은 실사용 피드백을 본 뒤 결정한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import ReviewItemCard from "@/components/toefl/review/ReviewItemCard";
import { SECTION_LABEL_KEY, SECTION_ORDER } from "@/lib/toefl/section-order";
import { useLang } from "@/lib/i18n";
import type { ReviewItem } from "@/components/toefl/review/types";

export default function ToeflReviewQueuePage() {
  const router = useRouter();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/toefl/review-queue", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.message ?? "Failed to load your review queue.");
        setLoading(false);
        return;
      }
      setItems(data.items);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (loading) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex items-center justify-center py-24">
          <p className="text-sm text-[var(--secondary)]">{t("loading")}</p>
        </main>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <p className="text-sm text-red-600">⚠ {errorMsg}</p>
          <button onClick={() => router.push("/toefl/mypage")} className="text-sm text-[var(--secondary)] underline">
            ← Back to My Page
          </button>
        </main>
      </div>
    );
  }

  const sections = SECTION_ORDER.filter((s) => items.some((i) => i.section === s));

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">Review queue</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">
          Your most recent incorrect answers, newest first. Speaking and Writing responses aren&apos;t included — right/wrong
          isn&apos;t a clean fit for those.
        </p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
            Nothing to review right now — no recent incorrect answers found.
          </div>
        ) : (
          <>
            {sections.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {sections.map((s) => (
                  <a
                    key={s}
                    href={`#section-${s}`}
                    className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1 text-xs font-medium text-[var(--foreground)]"
                  >
                    {t(SECTION_LABEL_KEY[s])}
                  </a>
                ))}
              </div>
            )}

            {sections.map((section) => {
              const sectionItems = items.filter((i) => i.section === section);
              return (
                <div key={section} id={`section-${section}`} className="mt-10 scroll-mt-20">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">{t(SECTION_LABEL_KEY[section])}</h2>
                  <div className="mt-3 space-y-4">
                    {sectionItems.map((item, idx) => (
                      <ReviewItemCard key={item.id} item={item} index={idx} />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <button onClick={() => router.push("/toefl/mypage")} className="mt-10 text-sm text-[var(--secondary)] underline">
          ← Back to My Page
        </button>
      </main>
    </div>
  );
}
