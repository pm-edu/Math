"use client";

// 수학 학습 진행 구조 PG2: 대시보드 (RUN_MATH_PROGRESSION.md PG2).
// 주 CTA는 하나 — v_math_next_action 한 행만 읽어서 큰 카드 하나로 렌더한다.
// 조건 분기는 뷰(SQL) 쪽에서 이미 끝났으니, 이 페이지는 결과를 보여주기만 한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang, nextActionReasonLabel } from "@/lib/i18n";

interface NextAction {
  action_type: "resume_session" | "review" | "practice" | "done";
  unit_id: string | null;
  unit_name: string | null;
  session_kind: string;
  item_count: number;
  reason_ko: string;
}

export default function StudyPage() {
  const router = useRouter();
  const { t, lang } = useLang();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
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

      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const [actionResult, streakResult, weeklyResult] = await Promise.all([
        supabase.from("v_math_next_action").select("*").maybeSingle(),
        supabase.from("v_math_streak").select("current_streak_days").maybeSingle(),
        supabase.from("math_daily_activity").select("sessions_done, items_done").gte("date", weekAgo),
      ]);

      if (actionResult.error) {
        setError(t("study_errorLoad"));
      } else {
        setNextAction(actionResult.data as NextAction | null);
      }
      setStreakDays(streakResult.data?.current_streak_days ?? 0);
      const weeklyRows = weeklyResult.data ?? [];
      setWeekly({
        sessions: weeklyRows.reduce((sum, r) => sum + r.sessions_done, 0),
        items: weeklyRows.reduce((sum, r) => sum + r.items_done, 0),
      });
      setLoading(false);
    }

    load();
    // t는 lang이 바뀌면 새 함수가 되지만, 에러 문구 갱신 때문에 재조회할 필요는 없다 —
    // 의존성에 넣으면 언어 전환마다 불필요한 재조회가 일어난다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <div className="space-y-6">
            <TodayCard nextAction={nextAction} lang={lang} t={t} />

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

            <details className="rounded-2xl border border-[var(--border-c)] bg-white p-5 text-sm">
              <summary className="cursor-pointer text-[var(--secondary)]">···</summary>
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/study/path" className="text-[var(--foreground)] hover:underline">
                  {t("study_pathLink")}
                </Link>
                <Link href="/study/review" className="text-[var(--foreground)] hover:underline">
                  {t("study_reviewLink")}
                </Link>
              </div>
            </details>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function TodayCard({
  nextAction,
  lang,
  t,
}: {
  nextAction: NextAction | null;
  lang: "ko" | "en";
  t: (key: Parameters<ReturnType<typeof useLang>["t"]>[0]) => string;
}) {
  if (!nextAction || nextAction.action_type === "done") {
    return (
      <section className="rounded-2xl border border-[var(--border-c)] bg-[var(--mint)]/40 p-8 text-center">
        <p className="text-lg font-medium text-[var(--mint-dark)]">{t("study_doneTitle")}</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">{t("study_doneBody")}</p>
      </section>
    );
  }

  const buttonLabel = nextAction.action_type === "resume_session" ? t("study_resumeButton") : t("study_startButton");

  return (
    <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
      <p className="text-xs font-medium text-[var(--secondary)]">{t("study_todayTitle")}</p>
      <h1 className="mt-2 text-2xl font-medium text-[var(--foreground)]">{nextAction.unit_name}</h1>
      <p className="mt-1 text-sm text-[var(--secondary)]">{nextActionReasonLabel(nextAction.reason_ko, lang)}</p>
      <Link
        href={`/study/${nextAction.unit_id}?kind=${nextAction.session_kind}`}
        className="mt-6 inline-block rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
      >
        {buttonLabel}
      </Link>
    </section>
  );
}
