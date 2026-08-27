"use client";

// TOEFL 종합 리포트. docs/toefl-spec.md §7(밴드+영역점수+총점 병기), §8(적응형 라우팅 결과
// 공개), §9(GET /report), §13(강약점). section_practice(단일 영역)든 full(4영역)이든 이 페이지
// 하나로 보여준다.
// 종합 밴드/총점은 submit 라우트가 이미 계산해 toefl_attempt.overall_band/total_scaled에
// 저장해둔 값을 그대로 읽는다(요청: "리포트 데이터를 클라이언트에서 재계산하지 말 것" — 예전엔
// 여기서 매번 평균/합산을 다시 계산했었음). 라우팅 결과·강약점은 skill_tags 등 staff-only 데이터가
// 필요해서 /api/toefl/attempts/[id]/insights 라우트(service role)가 계산한 값만 그대로 쓴다.
// 언어 토글 적용 대상(2026-08-18) — 안내 화면. 라우팅 문구는 서버가 프로즈를 안 내려주고
// routed_to 값만 주므로, 여기서 t()로 직접 조립한다(그래야 언어 전환 시 이 문장도 같이 바뀜).

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bandDescription, bandToCefr, type CefrLookupRow } from "@/lib/toefl/scoring";
import { SECTION_LABEL_KEY, SECTION_ORDER, TASK_TYPE_SECTION } from "@/lib/toefl/section-order";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import BandGauge from "@/components/toefl/BandGauge";
import { interpolate, useLang, type DictKey } from "@/lib/i18n";
import type { ToeflRoute, ToeflSection, ToeflTaskType } from "@/lib/toefl/types";
import type { SkillTagStat } from "@/lib/toefl/scoring";

type SectionRow = {
  section: ToeflSection;
  raw_score: number | null;
  scaled_score: number | null;
  band: number | null;
  finished_at: string | null;
};

type Insight = {
  section: ToeflSection;
  routed_to: ToeflRoute | null;
  weak_tags: SkillTagStat[];
  strong_tags: SkillTagStat[];
};

const ROUTE_CAP_KEY: Record<"easy" | "hard", DictKey> = {
  easy: "toefl_routeCapEasy",
  hard: "toefl_routeCapHard",
};

export default function ToeflReportPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();
  const { lang, t } = useLang();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [overallBand, setOverallBand] = useState<number | null>(null);
  const [totalScaled, setTotalScaled] = useState<number | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pendingManualCount, setPendingManualCount] = useState(0);
  // 화면 검토(2026-08-27) [B/E]: pending_manual 문항이 속한 영역만 "잠정" 표시를 해야 한다 —
  // 카운트만으론 어느 영역 점수가 아직 안 굳었는지 알 수 없어서 별도로 든다.
  const [pendingManualSections, setPendingManualSections] = useState<Set<ToeflSection>>(new Set());
  // 밴드→CEFR 매핑은 하드코딩이 아니라 toefl_scale_conversion.cefr에서 조회한다(2026-08-27
  // 교차검증 B1 — scale.ts가 더 이상 이 매핑을 코드에 갖고 있지 않다).
  const [cefrRows, setCefrRows] = useState<CefrLookupRow[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }
      const { data: attempt } = await supabase
        .from("toefl_attempt")
        .select("id, form_id, mode, overall_band, total_scaled")
        .eq("id", attemptId)
        .maybeSingle();
      if (!attempt) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setMode(attempt.mode);
      setOverallBand(attempt.overall_band);
      setTotalScaled(attempt.total_scaled);

      const { data: form } = await supabase
        .from("toefl_form")
        .select("blueprint_version")
        .eq("id", attempt.form_id)
        .maybeSingle();
      if (form?.blueprint_version) {
        // 이 폼의 버전 안에서는 영역·경로 무관하게 밴드→CEFR 대응이 전부 같은 곡선이라
        // (시드가 6개 section/route 조합에 동일한 표를 반복해서 넣는다), 하나만 조회해서
        // band 기준으로 중복 제거하면 충분하다 — section/route를 임의로 하나 고정하지 않는다.
        const { data: cefr } = await supabase
          .from("toefl_scale_conversion")
          .select("band, cefr")
          .eq("version", form.blueprint_version);
        const byBand = new Map((cefr ?? []).map((r) => [r.band, r.cefr as string]));
        setCefrRows(Array.from(byBand, ([band, cefrValue]) => ({ band, cefr: cefrValue })));
      }

      const { data: rows } = await supabase
        .from("toefl_section_attempt")
        .select("section, raw_score, scaled_score, band, finished_at")
        .eq("attempt_id", attemptId);
      const ordered = [...(rows ?? [])].sort(
        (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
      );
      setSections(ordered);
      setLoading(false);

      // ai_rubric 문항인데 아직 ai_score가 없는 응답 수 — 있으면 "선생님 1:1 첨삭" CTA를 보여준다.
      // (submitted 페이지와 같은 판정 로직이지만 여긴 개수만 필요해서 따로 가볍게 조회한다.)
      const { data: responses } = await supabase.from("toefl_response").select("id, item_id").eq("attempt_id", attemptId);
      const itemIds = (responses ?? []).map((r) => r.item_id);
      if (itemIds.length) {
        const { data: itemRows } = await supabase.from("toefl_item_public").select("id, task_type, scoring_mode").in("id", itemIds);
        const aiRubricItems = new Map(
          (itemRows ?? []).filter((i) => i.scoring_mode === "ai_rubric").map((i) => [i.id, i.task_type as ToeflTaskType])
        );
        const aiRubricResponses = (responses ?? []).filter((r) => aiRubricItems.has(r.item_id));
        if (aiRubricResponses.length) {
          const { data: scoreRows } = await supabase
            .from("toefl_ai_score")
            .select("response_id")
            .in(
              "response_id",
              aiRubricResponses.map((r) => r.id)
            );
          const scored = new Set((scoreRows ?? []).map((s) => s.response_id));
          const pending = aiRubricResponses.filter((r) => !scored.has(r.id));
          setPendingManualCount(pending.length);
          setPendingManualSections(new Set(pending.map((r) => TASK_TYPE_SECTION[aiRubricItems.get(r.item_id)!])));
        }
      }

      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/insights`, {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setInsights(data.sections);
    }

    load();
  }, [attemptId, router]);

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

  if (notFound) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <p className="text-sm text-red-600">⚠ {t("toefl_reportNotFound")}</p>
          <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
            {t("toefl_backHome")}
          </button>
        </main>
      </div>
    );
  }

  const finishedSections = sections.filter((s) => s.finished_at);
  const allDone = finishedSections.length === sections.length && sections.length > 0;
  const cefr = overallBand && cefrRows.length > 0 ? bandToCefr(overallBand, cefrRows) : null;
  const insightBySection = new Map(insights.map((i) => [i.section, i]));
  const routedInsights = insights.filter((i) => i.routed_to === "easy" || i.routed_to === "hard");

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("toefl_reportTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">{mode === "full" ? t("toefl_fullTest") : t("toefl_sectionPractice")}</p>

        {!allDone && (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t("toefl_reportIncomplete")}
          </p>
        )}

        {pendingManualCount > 0 && (
          <div className="mt-4 rounded-2xl border border-[var(--pink)]/40 bg-[var(--pink-light)]/30 px-5 py-4">
            <p className="text-sm font-semibold text-[var(--pink-dark)]">{t("toefl_tutorCtaTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--foreground)]">
              {interpolate(t("toefl_tutorCtaDesc"), { count: pendingManualCount })}
            </p>
            <button
              type="button"
              onClick={() => router.push("/contact")}
              className="mt-3 rounded-full bg-[var(--pink-dark)] px-4 py-1.5 text-xs font-medium text-white"
            >
              {t("toefl_tutorCtaButton")}
            </button>
          </div>
        )}

        <div className="mt-8 overflow-x-auto rounded-2xl border border-[var(--border-c)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--mint)]/20 text-left text-[var(--secondary)]">
              <tr>
                <th className="px-4 py-2 font-medium">{t("toefl_colSection")}</th>
                <th className="px-4 py-2 font-medium">{t("toefl_colScaled")}</th>
                <th className="px-4 py-2 font-medium">{t("toefl_colBand")}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const provisional = pendingManualSections.has(s.section);
                return (
                  <tr key={s.section} className="border-t border-[var(--border-c)]">
                    <td className="px-4 py-2 text-[var(--foreground)]">{t(SECTION_LABEL_KEY[s.section])}</td>
                    <td className="px-4 py-2 text-[var(--foreground)]">
                      {s.finished_at ? (s.scaled_score ?? "—") : t("toefl_notTaken")}
                      {provisional && (
                        <span className="ml-1.5 text-[11px] font-semibold text-amber-700">({t("toefl_provisional")})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[var(--foreground)]">{s.finished_at ? (s.band ?? "—") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6 text-center">
          <p className="text-sm text-[var(--secondary)]">{t("toefl_overallBand")}</p>
          <p className="text-4xl font-bold text-[var(--mint-dark)]">
            {overallBand || "—"}
            {pendingManualCount > 0 && (
              <span className="ml-2 align-middle text-xs font-semibold text-amber-700">⏳ {t("toefl_pendingManualBadge")}</span>
            )}
          </p>
          <div className="mx-auto mt-4 max-w-xs">
            <BandGauge band={overallBand ?? 0} />
          </div>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            {interpolate(t("toefl_totalScaled"), { total: totalScaled ?? "—", max: sections.length * 30 })}
          </p>
          {overallBand !== null && overallBand > 0 && cefr && (
            <>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pink-light)] px-3 py-1 text-xs font-medium text-[var(--pink-dark)]">
                ≈ CEFR {cefr}
              </span>
              <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-[var(--secondary)]">
                {bandDescription(overallBand, cefrRows, lang)}
              </p>
            </>
          )}
        </div>

        {routedInsights.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">{t("toefl_adaptiveRouting")}</h2>
            {routedInsights.map((i) => (
              <p key={i.section} className="mt-1.5 text-xs leading-relaxed text-[var(--secondary)]">
                <span className="font-medium text-[var(--foreground)]">{t(SECTION_LABEL_KEY[i.section])}:</span>{" "}
                {t(ROUTE_CAP_KEY[i.routed_to as "easy" | "hard"])}
              </p>
            ))}
          </div>
        )}

        {insights.some((i) => i.weak_tags.length > 0 || i.strong_tags.length > 0) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {sections
              .filter((s) => insightBySection.get(s.section))
              .map((s) => {
                const insight = insightBySection.get(s.section)!;
                if (insight.weak_tags.length === 0 && insight.strong_tags.length === 0) return null;
                return (
                  <div key={s.section} className="rounded-2xl border border-[var(--border-c)] bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--foreground)]">{t(SECTION_LABEL_KEY[s.section])}</p>
                    {insight.strong_tags.length > 0 && (
                      <p className="mt-1.5 text-xs text-[var(--mint-dark)]">
                        ✓ {t("toefl_strong")} {insight.strong_tags.map((tag) => tag.tag.replace(/_/g, " ")).join(", ")}
                      </p>
                    )}
                    {insight.weak_tags.length > 0 && (
                      <p className="mt-1 text-xs text-red-600">
                        ⚠ {t("toefl_needsWork")} {insight.weak_tags.map((tag) => tag.tag.replace(/_/g, " ")).join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        <button
          onClick={() => router.push(`/toefl/report/${attemptId}/review`)}
          className="mt-8 w-full rounded-full border border-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          {t("toefl_reviewEachQuestion")}
        </button>

        <button onClick={() => router.push("/toefl")} className="mt-4 block text-sm text-[var(--secondary)] underline">
          {t("toefl_backHome")}
        </button>
      </main>
    </div>
  );
}
