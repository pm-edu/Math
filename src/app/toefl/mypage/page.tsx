"use client";

// TOEFL 마이페이지: 지난 응시 기록 + 중단된 시험을 한 곳에서 선택할 수 있게(요청, 2026-08-18).
// 예전엔 /toefl 진입화면이 가장 최근 in_progress 하나만 "이어하기" 배너로 자동으로 띄웠는데,
// 로그아웃 후 로그인해도 계속 뜨는 게 방해된다는 피드백으로 그 배너를 없애고 여기로 옮겼다 —
// 여러 개 중단된 시험이 있어도 전부 보여주고, 이어할지 폐기할지 사용자가 직접 고른다.
// 폐기(discard)는 실제 행 삭제가 아니라 status='abandoned'로만 바꾼다(toefl_attempt_status enum에
// 이미 있던 값인데 지금까지 어디서도 안 썼음) — RLS "own attempts" 정책이 본인 attempt의 update를
// 이미 허용해서 서버 라우트 없이 클라이언트에서 직접 한다.
// 언어 토글 적용 대상(2026-08-18) — 안내 화면.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SECTION_LABEL_KEY } from "@/lib/toefl/section-order";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { interpolate, useLang } from "@/lib/i18n";
import type { ToeflAttemptStatus, ToeflSection } from "@/lib/toefl/types";

type AttemptRow = {
  id: string;
  form_id: string;
  mode: string;
  status: ToeflAttemptStatus;
  started_at: string;
  submitted_at: string | null;
  overall_band: number | null;
};

type InProgressRow = AttemptRow & { currentSection: ToeflSection | null };

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export default function ToeflMyPage() {
  const router = useRouter();
  const { lang, t } = useLang();
  const [loading, setLoading] = useState(true);
  const [formTitleById, setFormTitleById] = useState<Record<string, string>>({});
  const [inProgress, setInProgress] = useState<InProgressRow[]>([]);
  const [past, setPast] = useState<AttemptRow[]>([]);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }

      const [{ data: attempts }, { data: forms }] = await Promise.all([
        supabase
          .from("toefl_attempt")
          .select("id, form_id, mode, status, started_at, submitted_at, overall_band")
          .eq("user_id", auth.user.id)
          .order("started_at", { ascending: false }),
        supabase.from("toefl_form").select("id, title"),
      ]);

      setFormTitleById(Object.fromEntries((forms ?? []).map((f) => [f.id, f.title])));

      const inProgressAttempts = (attempts ?? []).filter((a) => a.status === "in_progress");
      const pastAttempts = (attempts ?? []).filter((a) => a.status !== "in_progress" && a.status !== "abandoned");

      const attemptIds = inProgressAttempts.map((a) => a.id);
      const { data: sectionRows } = attemptIds.length
        ? await supabase
            .from("toefl_section_attempt")
            .select("attempt_id, section, started_at")
            .in("attempt_id", attemptIds)
            .order("started_at", { ascending: false })
        : { data: [] as { attempt_id: string; section: ToeflSection; started_at: string }[] };

      const currentSectionByAttempt = new Map<string, ToeflSection>();
      for (const row of sectionRows ?? []) {
        if (!currentSectionByAttempt.has(row.attempt_id)) currentSectionByAttempt.set(row.attempt_id, row.section);
      }

      setInProgress(
        inProgressAttempts.map((a) => ({ ...a, currentSection: currentSectionByAttempt.get(a.id) ?? null }))
      );
      setPast(pastAttempts);
      setLoading(false);
    }

    load();
  }, [router]);

  async function discard(attemptId: string) {
    const ok = window.confirm(t("toefl_discardConfirm"));
    if (!ok) return;
    setDiscardingId(attemptId);
    setError(null);
    const supabase = createClient();
    const { error: updateErr } = await supabase.from("toefl_attempt").update({ status: "abandoned" }).eq("id", attemptId);
    setDiscardingId(null);
    if (updateErr) {
      setError(interpolate(t("toefl_failedDiscard"), { message: updateErr.message }));
      return;
    }
    setInProgress((prev) => prev.filter((a) => a.id !== attemptId));
  }

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

  const locale = lang === "en" ? "en-US" : "ko-KR";

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("mypage")}</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">{t("toefl_myPageSubtitle")}</p>

        {error && <p className="mt-4 text-sm text-red-600">⚠ {error}</p>}

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--secondary)]">{t("toefl_inProgress")}</h2>
          {inProgress.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--secondary)]">{t("toefl_nothingInProgress")}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {inProgress.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-[var(--mint-dark)]/25 bg-[var(--mint)]/20 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {formTitleById[a.form_id] ?? t("toefl_title")} ·{" "}
                      {a.mode === "full" ? t("toefl_fullTest") : t("toefl_sectionPractice")}
                    </p>
                    <p className="text-xs text-[var(--secondary)]">
                      {interpolate(t("toefl_startedOn"), { date: formatDate(a.started_at, locale) })}
                      {a.currentSection &&
                        ` · ${interpolate(t("toefl_inProgressSuffix"), { section: t(SECTION_LABEL_KEY[a.currentSection]) })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => discard(a.id)}
                      disabled={discardingId === a.id}
                      className="rounded-full border border-[var(--border-c)] px-3 py-1.5 text-xs font-medium text-[var(--secondary)] disabled:opacity-50"
                    >
                      {discardingId === a.id ? t("toefl_discarding") : t("toefl_discard")}
                    </button>
                    {a.currentSection && (
                      <button
                        onClick={() => router.push(`/toefl/test/${a.id}/${a.currentSection}`)}
                        className="rounded-full bg-[var(--mint-dark)] px-4 py-1.5 text-xs font-medium text-white"
                      >
                        {t("toefl_resume")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-[var(--secondary)]">{t("toefl_pastAttempts")}</h2>
          {past.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--secondary)]">{t("toefl_noPastAttempts")}</p>
          ) : (
            <div className="mt-2 space-y-2">
              {past.map((a) => (
                <button
                  key={a.id}
                  onClick={() => router.push(`/toefl/report/${a.id}`)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--border-c)] bg-white px-4 py-3 text-left hover:bg-[var(--mint)]/10"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {formTitleById[a.form_id] ?? t("toefl_title")} ·{" "}
                      {a.mode === "full" ? t("toefl_fullTest") : t("toefl_sectionPractice")}
                    </p>
                    <p className="text-xs text-[var(--secondary)]">
                      {formatDate(a.submitted_at ?? a.started_at, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {a.overall_band ? (
                      <p className="text-sm font-semibold text-[var(--mint-dark)]">
                        {interpolate(t("toefl_bandLabel"), { band: a.overall_band })}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--secondary)]">{t("toefl_viewReport")}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <button onClick={() => router.push("/toefl")} className="mt-10 text-sm text-[var(--secondary)] underline">
          {t("toefl_backHome")}
        </button>
      </main>
    </div>
  );
}
