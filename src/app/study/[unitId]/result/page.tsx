"use client";

// 수학 학습 진행 구조 PG3: 세션 결과 화면 (RUN_MATH_PROGRESSION.md PG3 3-1/3-2).
// 정답률·소요시간·숙달 게이지 + 다음 액션 버튼 1개 — 여기서 흐름이 끊기면 안 되므로 버튼은
// 대시보드가 아니라 v_math_next_action이 가리키는 다음 세션으로 바로 연결한다.
//
// 새로고침해도 그대로 다시 그려지도록, 결과를 페이지 간에 들고 다니지 않고 전부 서버(RLS로
// 본인 것만 보이는 math_sessions/math_unit_states/v_math_next_action)에서 다시 읽는다.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLang, nextActionReasonLabel } from "@/lib/i18n";

interface ResultData {
  itemCount: number;
  correctCount: number;
  elapsedSeconds: number;
  unitStatus: "locked" | "available" | "in_progress" | "mastered" | null;
  masteryScore: number | null;
}

interface NextAction {
  action_type: "resume_session" | "review" | "practice" | "done";
  unit_id: string | null;
  unit_name: string | null;
  session_kind: string;
  reason_ko: string;
}

export default function StudyResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t, lang } = useLang();
  const sessionId = searchParams.get("sessionId");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setError(t("study_noItems"));
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data: session, error: sessionErr } = await supabase
        .from("math_sessions")
        .select("item_count, correct_count, started_at, completed_at, unit_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (sessionErr || !session) {
        setError(t("study_noItems"));
        setLoading(false);
        return;
      }

      const { data: unitState } = await supabase
        .from("math_unit_states")
        .select("status, mastery_score")
        .eq("user_id", auth.user.id)
        .eq("unit_id", session.unit_id)
        .maybeSingle();

      const elapsedSeconds = session.completed_at
        ? Math.max(0, Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000))
        : 0;

      setResult({
        itemCount: session.item_count,
        correctCount: session.correct_count,
        elapsedSeconds,
        unitStatus: unitState?.status ?? null,
        masteryScore: unitState?.mastery_score ?? null,
      });

      const { data: action } = await supabase.from("v_math_next_action").select("*").maybeSingle();
      setNextAction(action as NextAction | null);

      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const accuracyPct = result && result.itemCount > 0 ? Math.round((result.correctCount / result.itemCount) * 100) : 0;
  const minutes = result ? Math.floor(result.elapsedSeconds / 60) : 0;
  const seconds = result ? result.elapsedSeconds % 60 : 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : error || !result ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
            <p className="text-xs font-medium text-[var(--secondary)]">{t("study_resultTitle")}</p>
            <p className="mt-2 text-4xl font-medium text-[var(--foreground)]">{accuracyPct}%</p>
            <p className="text-xs text-[var(--secondary)]">
              {t("study_resultAccuracy")} · {result.correctCount}/{result.itemCount}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4 text-left">
              <div className="rounded-xl border border-[var(--border-c)] p-4">
                <p className="text-xs text-[var(--secondary)]">{t("study_resultTime")}</p>
                <p className="mt-1 text-lg font-medium text-[var(--foreground)]">
                  {minutes}:{String(seconds).padStart(2, "0")}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-c)] p-4">
                <p className="text-xs text-[var(--secondary)]">{t("study_resultMastery")}</p>
                <p className="mt-1 text-lg font-medium text-[var(--foreground)]">
                  {result.masteryScore !== null ? `${Math.round(result.masteryScore * 100)}%` : "-"}
                </p>
              </div>
            </div>

            {result.unitStatus === "mastered" && (
              <p className="mt-6 rounded-xl bg-[var(--mint)]/40 p-4 text-sm font-medium text-[var(--mint-dark)]">
                {t("study_resultMastered")}
              </p>
            )}

            {nextAction && nextAction.action_type !== "done" && nextAction.unit_id ? (
              <div className="mt-8">
                <p className="text-sm text-[var(--secondary)]">{nextActionReasonLabel(nextAction.reason_ko, lang)}</p>
                <Link
                  href={`/study/${nextAction.unit_id}?kind=${nextAction.session_kind}`}
                  className="mt-3 inline-block rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
                >
                  {t("study_resultContinue")}
                </Link>
              </div>
            ) : (
              <div className="mt-8">
                <Link
                  href="/study"
                  className="inline-block rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
                >
                  {t("study_resultBackToDashboard")}
                </Link>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
