"use client";

// 수학 학습 진행 구조 PG2: 대시보드 (RUN_MATH_PROGRESSION.md PG2).
// 주 CTA는 하나 — v_math_next_action 한 행만 읽어서 큰 카드 하나로 렌더한다.
// 조건 분기는 뷰(SQL) 쪽에서 이미 끝났으니, 이 페이지는 결과를 보여주기만 한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

export default function StudyPage() {
  const router = useRouter();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [streakDays, setStreakDays] = useState(0);
  const [weekly, setWeekly] = useState({ sessions: 0, items: 0 });

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      // 온보딩은 /onboarding/subjects 하나뿐이다(RUN_MATH_SITE.md 2.5단계 확정 — math_placements
      // 기반 옛 게이트는 동결). curriculum_group이 비어있으면(가입 시 필수라 신규 학생은 거의
      // 없음, 과거 가입자만 해당) 거기로 보낸다.
      const { data: profile } = await supabase.from("profiles").select("curriculum_group").eq("id", auth.user.id).maybeSingle();
      if (!profile?.curriculum_group) {
        router.replace("/onboarding/subjects");
        return;
      }

      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const [streakResult, weeklyResult] = await Promise.all([
        supabase.from("v_math_streak").select("current_streak_days").maybeSingle(),
        supabase.from("math_daily_activity").select("sessions_done, items_done").gte("date", weekAgo),
      ]);

      setStreakDays(streakResult.data?.current_streak_days ?? 0);
      const weeklyRows = weeklyResult.data ?? [];
      setWeekly({
        sessions: weeklyRows.reduce((sum, r) => sum + r.sessions_done, 0),
        items: weeklyRows.reduce((sum, r) => sum + r.items_done, 0),
      });
      setLoading(false);
    }

    load();
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : (
          <div className="space-y-6">
            <TodayCard />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">{t("study_streakLabel")}</p>
                <p className="mt-1 text-2xl font-medium text-[var(--foreground)]">
                  {streakDays}
                  <span className="ml-1 text-sm font-normal text-[var(--secondary)]">{t("study_streakUnit")}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="text-xs text-[var(--secondary)]">{t("study_weeklyTitle")}</p>
                <p className="mt-1 text-2xl font-medium text-[var(--foreground)]">
                  {weekly.sessions}
                  <span className="ml-1 text-sm font-normal text-[var(--secondary)]">{t("study_weeklySessions")}</span>
                </p>
                <p className="text-xs text-[var(--secondary)]">
                  {weekly.items} {t("study_weeklyItems")}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

// RUN_MATH_SITE.md 3단계 전 임시 처리 — v_math_next_action 기반 카드는 옛 진단·세션 설계라
// 동결됐다(2.5단계). 4·5단계에서 과정(math_tracks)·문제지 기반으로 다시 만들 때까지 버튼 없는
// 안내 한 줄만 보여준다.
function TodayCard() {
  const { t } = useLang();
  return (
    <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
      <p className="text-sm text-[var(--secondary)]">{t("study_newScreenComingSoon")}</p>
    </section>
  );
}
