"use client";

// 제출 직후 채점 대기 화면. docs/toefl-spec.md §13(점진 공개), §9. 요청(2026-08-18):
// 빈 화면 금지, Reading/Listening은 즉시 공개, Speaking/Writing은 항목별 상태 표시,
// 폴링으로 갱신, 예상 소요시간 안내 + 창을 닫아도 된다는 안내.
//
// 실제로는 AI 채점(Writing/Speaking의 ai_rubric·auto_transcript 문항)이 각 섹션의 finish() 호출
// 안에서 이미 동기로 끝난다(§12 스펙의 "제출 → 큐" 비동기 파이프라인은 이 프로젝트엔 큐 인프라가
// 없어 채택 안 됨 — toefl-subsystem-plan 메모 참고) — 즉 이 화면에 도달한 시점엔 사실상 전부
// 채점이 끝나 있다. 그래도 폴링 자체는 가짜가 아니라 실제 DB 상태(toefl_ai_score 존재 여부)를
// 확인하는 것이라 유지한다 — 혹시라도 ai_score가 안 남은 응답이 있으면(드묾) "수동 검토 대기"로
// 정직하게 보여주고, 데이터를 클라이언트에서 지어내지 않는다(요청: 재계산 금지와 같은 원칙).

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { SECTION_LABEL, SECTION_ORDER, TASK_TYPE_SECTION } from "@/lib/toefl/section-order";
import type { ToeflSection, ToeflTaskType } from "@/lib/toefl/types";

type SectionRow = { section: ToeflSection; finished_at: string | null; band: number | null; scaled_score: number | null };
type ItemStatus = { itemId: string; taskType: ToeflTaskType; section: ToeflSection; status: "done" | "grading" | "manual_review" };

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 8; // ~24초. 그 뒤로도 안 끝나면 "수동 검토 대기"로 확정 표시.
const AI_RUBRIC_SECTIONS: ToeflSection[] = ["speaking", "writing"];

export default function ToeflSubmittedPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [items, setItems] = useState<ItemStatus[]>([]);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }

      const { data: attempt } = await supabase.from("toefl_attempt").select("id, status").eq("id", attemptId).maybeSingle();
      if (!attempt) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (attempt.status === "in_progress") {
        router.replace(`/toefl`);
        return;
      }

      const { data: sectionRows } = await supabase
        .from("toefl_section_attempt")
        .select("section, finished_at, band, scaled_score")
        .eq("attempt_id", attemptId);
      setSections(
        [...(sectionRows ?? [])].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section))
      );

      const { data: responses } = await supabase
        .from("toefl_response")
        .select("id, item_id, is_correct")
        .eq("attempt_id", attemptId);

      const itemIds = (responses ?? []).map((r) => r.item_id);
      const { data: itemRows } = itemIds.length
        ? await supabase.from("toefl_item_public").select("id, task_type, scoring_mode").in("id", itemIds)
        : { data: [] as { id: string; task_type: ToeflTaskType; scoring_mode: string }[] };
      const itemById = new Map((itemRows ?? []).map((i) => [i.id, i]));

      const aiRubricResponseIds = (responses ?? [])
        .filter((r) => itemById.get(r.item_id)?.scoring_mode === "ai_rubric")
        .map((r) => r.id);
      const { data: scoreRows } = aiRubricResponseIds.length
        ? await supabase.from("toefl_ai_score").select("response_id").in("response_id", aiRubricResponseIds)
        : { data: [] as { response_id: string }[] };
      const scoredResponseIds = new Set((scoreRows ?? []).map((s) => s.response_id));

      const nextItems: ItemStatus[] = (responses ?? [])
        .map((r) => {
          const item = itemById.get(r.item_id);
          if (!item) return null;
          const taskType = item.task_type as ToeflTaskType;
          const section = TASK_TYPE_SECTION[taskType];
          if (!AI_RUBRIC_SECTIONS.includes(section)) return null; // Reading/Listening은 섹션 카드로만 표시
          const graded = item.scoring_mode !== "ai_rubric" || scoredResponseIds.has(r.id);
          return {
            itemId: r.item_id,
            taskType,
            section,
            status: graded ? "done" : pollCount >= MAX_POLLS ? "manual_review" : "grading",
          } as ItemStatus;
        })
        .filter((x): x is ItemStatus => x !== null);

      setItems(nextItems);
      setLoading(false);
    }

    load();
  }, [attemptId, router, pollCount]);

  const stillGrading = items.some((i) => i.status === "grading");

  useEffect(() => {
    if (!stillGrading || pollCount >= MAX_POLLS) return;
    const t = setTimeout(() => setPollCount((c) => c + 1), POLL_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stillGrading, pollCount]);

  if (loading) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex items-center justify-center py-24">
          <p className="text-sm text-[var(--secondary)]">Loading...</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <p className="text-sm text-red-600">Attempt not found.</p>
          <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
            ← Back to TOEFL home
          </button>
        </main>
      </div>
    );
  }

  const readingListening = sections.filter((s) => s.section === "reading" || s.section === "listening");
  const speakingWriting = sections.filter((s) => s.section === "speaking" || s.section === "writing");

  const STATUS_LABEL: Record<ItemStatus["status"], { text: string; icon: string; className: string }> = {
    done: { text: "Graded", icon: "✓", className: "text-[var(--mint-dark)]" },
    grading: { text: "Grading…", icon: "⏳", className: "text-[var(--secondary)]" },
    manual_review: { text: "Pending manual review", icon: "🧑‍🏫", className: "text-amber-700" },
  };

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">Your test has been submitted</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          Most scores are ready right away. Speaking and Writing responses that use AI scoring can take a little
          longer — you can safely close this tab and check your report later; nothing will be lost.
        </p>

        {readingListening.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-[var(--secondary)]">Reading &amp; Listening</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {readingListening.map((s) => (
                <div
                  key={s.section}
                  className="flex items-center justify-between rounded-xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/20 px-4 py-3"
                >
                  <span className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABEL[s.section]}</span>
                  <span className="text-sm text-[var(--mint-dark)]">✓ Band {s.band ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {speakingWriting.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-[var(--secondary)]">Speaking &amp; Writing</h2>
            <div className="mt-2 space-y-2">
              {speakingWriting.map((s) => {
                const sectionItems = items.filter((i) => i.section === s.section);
                return (
                  <div key={s.section} className="rounded-xl border border-[var(--border-c)] bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--foreground)]">{SECTION_LABEL[s.section]}</span>
                      <span className="text-xs text-[var(--secondary)]">
                        {sectionItems.filter((i) => i.status === "done").length} / {sectionItems.length || "—"} graded
                      </span>
                    </div>
                    {sectionItems.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {sectionItems.map((it, idx) => {
                          const label = STATUS_LABEL[it.status];
                          return (
                            <li key={it.itemId} className={`flex items-center gap-1.5 text-xs ${label.className}`}>
                              <span aria-hidden="true">{label.icon}</span>
                              <span>
                                Item {idx + 1} — {label.text}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => router.push(`/toefl/report/${attemptId}`)}
          disabled={stillGrading}
          className="mt-8 w-full rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {stillGrading ? "Grading in progress…" : "Continue to your report →"}
        </button>
      </main>
    </div>
  );
}
