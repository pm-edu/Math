"use client";

// TOEFL 대시보드(진입화면). docs/toefl-spec.md §10.
// 선택 위계 개선(2026-08-18): 풀 모의고사를 가장 눈에 띄는 카드로, 영역별 연습은 테두리만 있는
// 조용한 카드로 낮춰서 "일단 뭘 눌러야 하는지"가 한눈에 보이게 함. 진행 중인 시험이 있으면
// 이어하기 배너를 맨 위에 띄운다.
// 시간·문항수는 절대 하드코딩하지 않고 toefl_form_blueprint에서 계산한다(spec §2 필수 요구사항,
// src/lib/toefl/blueprint-summary.ts).
// 학생 응시 화면은 영어만 쓴다(§14).
//
// 체험 방식 확정 (2026-08-18): 처음엔 Supabase 익명 로그인으로 "진짜 시험 1회"를 체험시키는
// 방식을 만들었으나, 사용자가 "체험은 단순히 샘플을 보여주는 수준"이면 된다고 범위를 좁힘 —
// 비회원도 반복 응시 가능했던 것과 문제은행이 계정 없이 노출되는 것 둘 다 부담스럽다는 이유.
// 그래서 익명 로그인·1회제한·Resume숨김 로직을 전부 제거하고, 대신 로그인 전혀 없이 인증 없는
// 서버 라우트(/api/toefl/sample, service role)로 문항 몇 개만 미리보기(/toefl/sample)로 보여주고
// 실제 응시는 가입/로그인 후로 확정했다.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, summarizeBySection, totalSummary, type BlueprintSummaryRow } from "@/lib/toefl/blueprint-summary";
import { SECTION_DESCRIPTION, SECTION_LABEL, SECTION_ORDER } from "@/lib/toefl/section-order";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import type { ToeflSection } from "@/lib/toefl/types";

type ToeflForm = { id: string; code: string; title: string; blueprint_version: string };
type FormWithBlueprint = ToeflForm & { rows: BlueprintSummaryRow[] };
type ResumeState = { attemptId: string; section: ToeflSection };
type Phase = "loading" | "gate" | "ready";

export default function ToeflDashboardPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [forms, setForms] = useState<FormWithBlueprint[]>([]);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setPhase("gate");
      return;
    }

    const [{ data: formRows }, { data: inProgress }] = await Promise.all([
      supabase.from("toefl_form").select("id, code, title, blueprint_version").eq("is_published", true).order("created_at"),
      supabase
        .from("toefl_attempt")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1),
    ]);

    if (inProgress && inProgress.length > 0) {
      const attemptId = inProgress[0].id;
      const { data: sectionRows } = await supabase
        .from("toefl_section_attempt")
        .select("section")
        .eq("attempt_id", attemptId)
        .order("started_at", { ascending: false })
        .limit(1);
      if (sectionRows && sectionRows.length > 0) {
        setResume({ attemptId, section: sectionRows[0].section as ToeflSection });
      }
    }

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

  async function startSection(formId: string, section: ToeflSection) {
    setError(null);
    const key = `${formId}:${section}`;
    setStarting(key);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ form_id: formId, mode: "section_practice", section }),
    });
    const data = await res.json();
    setStarting(null);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "Failed to start the test.");
      return;
    }
    router.push(`/toefl/test/${data.attempt_id}/${section}`);
  }

  // 풀 모의고사(mode='full')는 항상 reading부터 시작한다(§2 고정 순서). 이후 각 영역 화면이
  // 다음 영역 시작(sections/:s/start)으로 이어 붙인다.
  async function startFull(formId: string) {
    setError(null);
    const key = `${formId}:full`;
    setStarting(key);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ form_id: formId, mode: "full" }),
    });
    const data = await res.json();
    setStarting(null);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "Failed to start the test.");
      return;
    }
    router.push(`/toefl/test/${data.attempt_id}/reading`);
  }

  if (phase === "gate") {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">TOEFL Practice</h1>
          <p className="mt-2 text-sm text-[var(--secondary)]">2026 format · Reading &amp; Listening adapt to your level</p>

          <button
            onClick={() => router.push("/toefl/sample")}
            className="mt-8 w-full rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-semibold text-[var(--pink-dark)]"
          >
            See sample questions →
          </button>
          <p className="mt-2 text-xs text-[var(--secondary)]">No account needed. Sign up to take the full, scored test.</p>

          {/* 헤더 우상단의 작은 "Log in" 링크만으로는 기존 회원이 못 찾고 지나칠 수 있어서
              (실사용 피드백, 2026-08-18), 본문에도 눈에 띄게 다시 넣는다. */}
          <div className="mt-6 flex items-center justify-center gap-2 border-t border-[var(--border-c)] pt-6 text-sm text-[var(--secondary)]">
            <span>Already have an account?</span>
            <button onClick={() => router.push("/login?toefl=1")} className="font-semibold text-[var(--pink-dark)] underline">
              Log in
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </main>
      </div>
    );
  }

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-medium text-[var(--foreground)]">TOEFL Practice</h1>
      <p className="mt-2 text-sm text-[var(--secondary)]">2026 format · Reading &amp; Listening adapt to your level</p>

      {resume && (
        <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-[var(--mint-dark)]/25 bg-[var(--mint)]/40 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--mint-dark)]">Continue where you left off</p>
            <p className="mt-0.5 text-sm text-[var(--foreground)]">{SECTION_LABEL[resume.section]} in progress</p>
          </div>
          <button
            onClick={() => router.push(`/toefl/test/${resume.attemptId}/${resume.section}`)}
            className="shrink-0 rounded-full bg-[var(--mint-dark)] px-5 py-2 text-sm font-medium text-white"
          >
            Resume →
          </button>
        </div>
      )}

      {phase === "loading" ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">Loading...</p>
      ) : forms.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">No practice sets are available yet.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {forms.map((f) => {
            const total = totalSummary(f.rows);
            const perSection = summarizeBySection(f.rows);
            const bySection = new Map(perSection.map((s) => [s.section, s]));
            const fullKey = `${f.id}:full`;

            return (
              <div key={f.id}>
                {/* 실전 모의고사 — 가장 크고 눈에 띄게. 색은 accent 하나, 버튼도 하나만. */}
                <div className="rounded-2xl border border-[var(--border-c)] bg-white px-7 py-7" style={{ borderTopWidth: 3, borderTopColor: "var(--pink)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pink-dark)]">Recommended</p>
                  <h2 className="mt-2 text-xl font-medium text-[var(--foreground)]">Take the Full Practice Test</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {SECTION_ORDER.map((s, i) => (
                      <span key={s} className="flex items-center gap-1.5">
                        <span className="rounded-full border border-[var(--border-c)] bg-[var(--background)] px-2.5 py-1 text-xs text-[var(--secondary)]">
                          {SECTION_LABEL[s]}
                        </span>
                        {i < SECTION_ORDER.length - 1 && <span className="text-[var(--border-c)]">→</span>}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-[var(--secondary)]">
                    4 sections · {total.itemCount} questions · about{" "}
                    <span className="font-medium text-[var(--foreground)]">{formatDuration(total.timeSec)}</span> total, no breaks
                  </p>
                  <button
                    onClick={() => startFull(f.id)}
                    disabled={starting === fullKey}
                    className="mt-5 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-semibold text-[var(--pink-dark)] disabled:opacity-60"
                  >
                    {starting === fullKey ? "Starting..." : "Start Full Test →"}
                  </button>
                </div>

                {/* 영역별 연습 — 테두리만 있는 조용한 카드로 낮은 존재감. */}
                <div className="mt-4 rounded-2xl border border-[var(--border-c)] px-6 py-5">
                  <p className="text-sm font-semibold text-[var(--secondary)]">Practice one section at a time</p>
                  <p className="text-xs text-[var(--secondary)] opacity-80">Shorter sessions, same question bank</p>
                  <div className="mt-3">
                    {SECTION_ORDER.map((s) => {
                      const stat = bySection.get(s);
                      const key = `${f.id}:${s}`;
                      return (
                        <div key={s} className="flex items-center justify-between gap-4 border-t border-[var(--border-c)] py-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--foreground)]">{SECTION_LABEL[s]}</p>
                            <p className="text-xs text-[var(--secondary)]">{SECTION_DESCRIPTION[s]}</p>
                            <p className="mt-1 text-[11px] text-[var(--pink-dark)]">
                              {stat ? `${stat.itemCount} questions · about ${formatDuration(stat.timeSec)}` : "Not available yet"}
                            </p>
                          </div>
                          <button
                            onClick={() => startSection(f.id, s)}
                            disabled={!stat || starting === key}
                            className="shrink-0 rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-40"
                          >
                            {starting === key ? "Starting..." : "Practice"}
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

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-10 text-xs text-[var(--secondary)]">
        TOEFL® is a registered trademark of ETS. This service is not endorsed or affiliated with ETS.
      </p>
      </main>
    </div>
  );
}
