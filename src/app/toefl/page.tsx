"use client";

// TOEFL 대시보드(진입화면). docs/toefl-spec.md §10.
// 선택 위계 개선(2026-08-18): 풀 모의고사를 가장 눈에 띄는 카드로, 영역별 연습은 테두리만 있는
// 조용한 카드로 낮춰서 "일단 뭘 눌러야 하는지"가 한눈에 보이게 함.
// 시간·문항수는 절대 하드코딩하지 않고 toefl_form_blueprint에서 계산한다(spec §2 필수 요구사항,
// src/lib/toefl/blueprint-summary.ts).
// 이 화면은 언어 토글 적용 대상이다(2026-08-18 추가 요청) — "학생 응시 화면은 영어만"(§14)은
// 실제 시험(test/[attemptId]/...)에만 해당하고, 이 진입화면은 안내 화면이라 한/영 전환 가능하다.
//
// 체험 방식 확정 (2026-08-18): 처음엔 Supabase 익명 로그인으로 "진짜 시험 1회"를 체험시키는
// 방식을 만들었으나, 사용자가 "체험은 단순히 샘플을 보여주는 수준"이면 된다고 범위를 좁힘 —
// 비회원도 반복 응시 가능했던 것과 문제은행이 계정 없이 노출되는 것 둘 다 부담스럽다는 이유.
// 그래서 익명 로그인·1회제한·Resume숨김 로직을 전부 제거하고, 대신 로그인 전혀 없이 인증 없는
// 서버 라우트(/api/toefl/sample, service role)로 문항 몇 개만 미리보기(/toefl/sample)로 보여주고
// 실제 응시는 가입/로그인 후로 확정했다.
// 진행 중인 시험 이어하기는 여기서 더 이상 자동으로 안 띄운다 — /toefl/mypage에서 지난 기록과
// 중단된 시험을 사용자가 직접 골라 이어하거나 폐기한다(2026-08-18 요청).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, summarizeBySection, totalSummary, type BlueprintSummaryRow } from "@/lib/toefl/blueprint-summary";
import { SECTION_DESCRIPTION_KEY, SECTION_LABEL_KEY, SECTION_ORDER } from "@/lib/toefl/section-order";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { interpolate, useLang } from "@/lib/i18n";
import type { ToeflSection } from "@/lib/toefl/types";

type ToeflForm = { id: string; code: string; title: string; blueprint_version: string };
type FormWithBlueprint = ToeflForm & { rows: BlueprintSummaryRow[] };
type Phase = "loading" | "gate" | "ready";

export default function ToeflDashboardPage() {
  const router = useRouter();
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>("loading");
  const [forms, setForms] = useState<FormWithBlueprint[]>([]);
  // 응시 이력 배지: 폼별로 과거에 제출까지 마친 attempt가 있으면 "Taken before"를 보여준다
  // (2026-08-18 추가 요청). 진행 중인 것과는 별개 — 완료된 것만 센다.
  const [completedCountByForm, setCompletedCountByForm] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setPhase("gate");
      return;
    }

    const [{ data: formRows }, { data: pastAttempts }] = await Promise.all([
      supabase.from("toefl_form").select("id, code, title, blueprint_version").eq("is_published", true).order("created_at"),
      supabase.from("toefl_attempt").select("form_id").eq("user_id", auth.user.id).neq("status", "in_progress"),
    ]);

    const counts: Record<string, number> = {};
    for (const a of pastAttempts ?? []) counts[a.form_id] = (counts[a.form_id] ?? 0) + 1;
    setCompletedCountByForm(counts);

    const versions = Array.from(new Set((formRows ?? []).map((f) => f.blueprint_version)));
    const blueprintByVersion = new Map<string, BlueprintSummaryRow[]>();
    await Promise.all(
      versions.map(async (version) => {
        const { data } = await supabase
          .from("toefl_form_blueprint")
          .select("section, stage, time_limit_sec, item_count")
          .eq("version", version);
        blueprintByVersion.set(version, data ?? []);
      })
    );

    setForms((formRows ?? []).map((f) => ({ ...f, rows: blueprintByVersion.get(f.blueprint_version) ?? [] })));
    setPhase("ready");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 실제 응시 생성(POST /api/toefl/attempts)은 더 이상 여기서 바로 안 한다 — 사전 점검
  // 화면(/toefl/check)을 먼저 거치도록 함(spec §11, 2026-08-18 추가 요청). 아직 attempt가
  // 없는 시점이라 폼/모드/영역을 쿼리 파라미터로 넘긴다.
  function goToCheck(formId: string, mode: "full" | "section_practice", section?: ToeflSection) {
    const params = new URLSearchParams({ formId, mode });
    if (section) params.set("section", section);
    router.push(`/toefl/check?${params.toString()}`);
  }

  if (phase === "gate") {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("toefl_title")}</h1>
          <p className="mt-2 text-sm text-[var(--secondary)]">{t("toefl_subtitle")}</p>

          <button
            onClick={() => router.push("/toefl/sample")}
            className="mt-8 w-full rounded-full bg-[var(--pink-dark)] px-6 py-3 text-sm font-semibold text-white"
          >
            {t("toefl_seeSample")}
          </button>
          <p className="mt-2 text-xs text-[var(--secondary)]">{t("toefl_sampleNote")}</p>

          {/* 헤더 우상단의 작은 "Log in" 링크만으로는 기존 회원이 못 찾고 지나칠 수 있어서
              (실사용 피드백, 2026-08-18), 본문에도 눈에 띄게 다시 넣는다. */}
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-[var(--border-c)] pt-6 text-sm text-[var(--secondary)]">
            <span>{t("haveAccount")}</span>
            <button onClick={() => router.push("/login?toefl=1")} className="font-semibold text-[var(--pink-dark)] underline">
              {t("login")}
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">⚠ {error}</p>}
        </main>
      </div>
    );
  }

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("toefl_title")}</h1>
      <p className="mt-2 text-sm text-[var(--secondary)]">{t("toefl_subtitle")}</p>

      {phase === "loading" ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">{t("loading")}</p>
      ) : forms.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">{t("toefl_noForms")}</p>
      ) : (
        <div className="mt-8 space-y-8">
          {forms.map((f) => {
            const total = totalSummary(f.rows);
            const perSection = summarizeBySection(f.rows);
            const bySection = new Map(perSection.map((s) => [s.section, s]));
            const completedCount = completedCountByForm[f.id] ?? 0;

            return (
              <div key={f.id}>
                {/* 실전 모의고사 — 가장 크고 눈에 띄게. 색은 accent 하나, 버튼도 하나만. */}
                <div className="rounded-2xl border border-[var(--border-c)] bg-white px-7 py-7" style={{ borderTopWidth: 3, borderTopColor: "var(--pink)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pink-dark)]">{t("toefl_recommended")}</p>
                    {completedCount > 0 && (
                      <span className="rounded-full bg-[var(--mint)]/50 px-2.5 py-0.5 text-[11px] font-medium text-[var(--mint-dark)]">
                        {interpolate(t("toefl_takenBefore"), { count: completedCount })}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-xl font-medium text-[var(--foreground)]">{t("toefl_fullTestTitle")}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {SECTION_ORDER.map((s, i) => (
                      <span key={s} className="flex items-center gap-1.5">
                        <span className="rounded-full border border-[var(--border-c)] bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--secondary)]">
                          {t(SECTION_LABEL_KEY[s])}
                        </span>
                        {i < SECTION_ORDER.length - 1 && <span className="text-[var(--border-c)]">→</span>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-[var(--secondary)]">
                    {interpolate(t("toefl_fullTestSummary"), {
                      count: total.itemCount,
                      duration: formatDuration(total.timeSec),
                    })}
                  </p>
                  <button
                    onClick={() => goToCheck(f.id, "full")}
                    className="mt-5 rounded-full bg-[var(--pink-dark)] px-6 py-3 text-sm font-semibold text-white"
                  >
                    {completedCount > 0 ? t("toefl_retakeFull") : t("toefl_startFull")}
                  </button>
                </div>

                {/* 영역별 연습 — 테두리만 있는 조용한 카드로 낮은 존재감. */}
                <div className="mt-4 rounded-2xl border border-[var(--border-c)] px-6 py-5">
                  <p className="text-sm font-semibold text-[var(--secondary)]">{t("toefl_practiceSectionTitle")}</p>
                  <p className="text-xs text-[var(--secondary)] opacity-80">{t("toefl_practiceSectionSub")}</p>
                  <div className="mt-3">
                    {SECTION_ORDER.map((s) => {
                      const stat = bySection.get(s);
                      return (
                        <div key={s} className="flex items-center justify-between gap-4 border-t border-[var(--border-c)] py-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">{t(SECTION_LABEL_KEY[s])}</p>
                            <p className="text-xs text-[var(--secondary)]">{t(SECTION_DESCRIPTION_KEY[s])}</p>
                            <p className="mt-1 text-[11px] text-[var(--pink-dark)]">
                              {stat
                                ? interpolate(t("toefl_sectionSummary"), { count: stat.itemCount, duration: formatDuration(stat.timeSec) })
                                : t("toefl_notAvailable")}
                            </p>
                          </div>
                          <button
                            onClick={() => goToCheck(f.id, "section_practice", s)}
                            disabled={!stat}
                            className="shrink-0 rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-40"
                          >
                            {t("toefl_practiceButton")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">⚠ {error}</p>}

      <p className="mt-10 text-xs text-[var(--secondary)]">{t("toefl_trademark")}</p>
      </main>
    </div>
  );
}
