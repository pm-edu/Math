"use client";

// TOEFL Listening 응시 화면. docs/toefl-spec.md §6, §10, §11.
// Reading 화면(test/[attemptId]/reading/page.tsx)과 상태관리 골격(로딩·타이머·자동저장·finish/submit)이
// 상당히 겹친다 — 다만 지금은 페이지가 2개뿐이라 공용 훅으로 뽑지 않았다(세 번째 영역이 생기는 P3/P4에서
// 반복이 뚜렷해지면 그때 추출하는 게 낫다고 판단, "규칙의 3법칙").
// Listening 고유 규칙(§6, §10):
// - 재생 완료 전 문항 노출 금지 → AudioPlayer가 끝나야 TaskRenderer가 나타난다.
// - 재생은 1회 → AudioPlayer 자체가 재생 버튼을 1번만 허용(재생 컨트롤 없음).
// - 뒤로 가기 불가 → Reading과 달리 문항 네비게이터가 클릭 불가(진행 표시만), Previous 버튼 없음.
// - 학생 응시 화면은 영어만 사용한다(§14).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import AudioPlayer from "@/components/toefl/AudioPlayer";
import type { ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

type CurrentResponse = {
  ok: true;
  attempt: { id: string; status: string };
  section: {
    section: string;
    finished: boolean;
    deadline_at: string | null;
    raw_score?: number | null;
    scaled_score?: number | null;
    band?: number | null;
  };
  module: { id: string; position: number; stage: "stage1" | "stage2" } | null;
  items: ToeflItemPublic[];
  stimuli: ToeflStimulusPublic[];
  answers: Record<string, { answer: unknown; time_spent_ms: number | null }>;
};

type Phase = "loading" | "in_module" | "section_done" | "submitted" | "error";

function audioUrlFor(item: ToeflItemPublic, stimuli: ToeflStimulusPublic[]): string | null {
  if (item.task_type === "choose_a_response") {
    const payload = item.payload as { clip_path?: string | null };
    return payload.clip_path ?? null;
  }
  if (item.stimulus_id) {
    return stimuli.find((s) => s.id === item.stimulus_id)?.audio_path ?? null;
  }
  return null;
}

export default function ToeflListeningTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [stimuli, setStimuli] = useState<ToeflStimulusPublic[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [stage, setStage] = useState<"stage1" | "stage2" | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [sectionResult, setSectionResult] = useState<{
    raw_score: number | null;
    scaled_score: number | null;
    band: number | null;
  } | null>(null);
  const [overall, setOverall] = useState<{ total_scaled: number; band: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const itemStartRef = useRef<number>(Date.now());
  const autoFinishedRef = useRef(false);

  const authHeaders = useCallback(async () => {
    if (!tokenRef.current) {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      tokenRef.current = data.session?.access_token ?? null;
    }
    return { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` };
  }, []);

  const loadCurrent = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.replace("/login");
      return;
    }
    const headers = await authHeaders();
    const res = await fetch(`/api/toefl/attempts/${attemptId}/current`, { headers });
    const data = (await res.json()) as CurrentResponse & { ok: boolean; message?: string };
    if (!res.ok || !data.ok) {
      setErrorMsg(data.message ?? "Failed to load the test.");
      setPhase("error");
      return;
    }

    if (data.section.finished) {
      setSectionResult({
        raw_score: data.section.raw_score ?? null,
        scaled_score: data.section.scaled_score ?? null,
        band: data.section.band ?? null,
      });
      setPhase(data.attempt.status === "in_progress" ? "section_done" : "submitted");
      return;
    }

    setItems(data.items);
    setStimuli(data.stimuli);
    const restored: Record<string, unknown> = {};
    const restoredSaved = new Set<string>();
    const restoredPlayed = new Set<string>();
    for (const [itemId, r] of Object.entries(data.answers)) {
      restored[itemId] = r.answer;
      restoredSaved.add(itemId);
      restoredPlayed.add(itemId); // 이미 답한 문항은 재생도 끝난 상태였을 것 — 새로고침 복구용
    }
    setAnswers(restored);
    setSavedIds(restoredSaved);
    setPlayedIds(restoredPlayed);
    setDeadlineAt(data.section.deadline_at);
    setStage(data.module?.stage ?? null);
    setActiveIndex(0);
    autoFinishedRef.current = false;
    itemStartRef.current = Date.now();
    setPhase("in_module");
  }, [attemptId, authHeaders, router]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  useEffect(() => {
    if (phase !== "in_module") return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  useEffect(() => {
    if (phase !== "in_module" || !deadlineAt) return;
    function tick() {
      const rem = new Date(deadlineAt as string).getTime() - Date.now();
      setRemainingMs(rem);
      if (rem <= 0 && !autoFinishedRef.current) {
        autoFinishedRef.current = true;
        finishModule();
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, deadlineAt]);

  async function saveResponse(itemId: string, answer: unknown) {
    const timeSpentMs = Date.now() - itemStartRef.current;
    const headers = await authHeaders();
    const res = await fetch(`/api/toefl/attempts/${attemptId}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ responses: [{ item_id: itemId, answer, time_spent_ms: timeSpentMs }] }),
    });
    if (res.ok) setSavedIds((prev) => new Set(prev).add(itemId));
  }

  function handleAnswerChange(itemId: string, answer: unknown) {
    setAnswers((prev) => ({ ...prev, [itemId]: answer }));
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    if (debounceTimers.current[itemId]) clearTimeout(debounceTimers.current[itemId]);
    debounceTimers.current[itemId] = setTimeout(() => saveResponse(itemId, answer), 3000);
  }

  async function flushPending(itemId: string) {
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId]);
      delete debounceTimers.current[itemId];
    }
    if (!savedIds.has(itemId) && itemId in answers) {
      await saveResponse(itemId, answers[itemId]);
    }
  }

  // Reading과 달리 앞으로만 이동한다 — Previous 없음, 임의 점프 없음(§11 4번 규칙).
  async function goNext() {
    const current = items[activeIndex];
    if (current) await flushPending(current.id);
    itemStartRef.current = Date.now();
    setActiveIndex((i) => i + 1);
  }

  // try/catch 없이 fetch가 실패하면 busy가 안 풀려서 화면이 멈춘다(실사용 중 writing 페이지에서
  // 발견된 버그, 모든 영역 페이지에 동일하게 적용).
  async function finishModule() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const current = items[activeIndex];
      if (current) await flushPending(current.id);

      const headers = await authHeaders();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/sections/listening/finish`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message ?? "Failed to finish this part.");
        return;
      }
      if (data.done) {
        setSectionResult({ raw_score: data.raw_score, scaled_score: data.scaled_score, band: data.band });
        setPhase("section_done");
      } else {
        setPhase("loading");
        loadCurrent();
      }
    } catch (e) {
      setErrorMsg(`Failed to finish this part: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/submit`, { method: "POST", headers });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message ?? "Failed to submit.");
        return;
      }
      setOverall(data.overall);
      setPhase("submitted");
    } catch (e) {
      setErrorMsg(`Failed to submit: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--secondary)]">Loading...</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">{errorMsg}</p>
        <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
          ← Back to TOEFL home
        </button>
      </main>
    );
  }

  if (phase === "section_done" || phase === "submitted") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">
          {phase === "submitted" ? "Result" : "Listening section complete"}
        </h1>
        <div className="w-full rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6">
          <p className="text-sm text-[var(--secondary)]">Listening band</p>
          <p className="text-4xl font-bold text-[var(--mint-dark)]">{sectionResult?.band ?? "—"}</p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            Scaled score: {sectionResult?.scaled_score ?? "—"} / 30
          </p>
        </div>
        {phase === "submitted" && overall && (
          <p className="text-sm text-[var(--secondary)]">Overall band (avg): {overall.band}</p>
        )}
        {phase === "section_done" && (
          <button
            onClick={submitAttempt}
            disabled={busy}
            className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit and see result"}
          </button>
        )}
        {phase === "submitted" && (
          <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
            ← Back to TOEFL home
          </button>
        )}
      </main>
    );
  }

  const activeItem = items[activeIndex];
  const activeStimulus = activeItem?.stimulus_id ? stimuli.find((s) => s.id === activeItem.stimulus_id) : null;
  const audioUrl = activeItem ? audioUrlFor(activeItem, stimuli) : null;
  const hasPlayed = activeItem ? playedIds.has(activeItem.id) || !audioUrl : false;
  const minutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const seconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeLow = remainingMs !== null && remainingMs <= 5 * 60 * 1000;
  const isLast = activeIndex >= items.length - 1;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-c)] bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--foreground)]">TOEFL Listening</p>
          {stage && (
            <span className="rounded-full bg-[var(--mint)]/40 px-2.5 py-0.5 text-xs font-medium text-[var(--mint-dark)]">
              Part {stage === "stage1" ? 1 : 2} of 2
            </span>
          )}
        </div>
        <p
          aria-live="polite"
          className={`text-sm font-semibold ${timeLow ? "text-red-600" : "text-[var(--foreground)]"}`}
        >
          {minutes !== null ? `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : "--:--"}
        </p>
      </header>

      {/* 진행 표시 전용(클릭 불가) — Listening은 뒤로 가기가 없다 */}
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-6 py-3">
        {items.map((it, idx) => (
          <span
            key={it.id}
            className={`h-2.5 w-2.5 rounded-full ${
              idx === activeIndex
                ? "bg-[var(--pink)]"
                : idx < activeIndex
                ? "bg-[var(--mint)]"
                : "border border-[var(--border-c)]"
            }`}
          />
        ))}
        <span className="ml-2 text-xs text-[var(--secondary)]">
          Item {activeIndex + 1} of {items.length}
        </span>
      </div>

      {errorMsg && <p className="mx-auto max-w-2xl px-6 text-sm text-red-600">{errorMsg}</p>}

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-2">
        {activeStimulus?.title && (
          <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{activeStimulus.title}</p>
        )}

        {audioUrl && !hasPlayed && (
          <AudioPlayer
            src={audioUrl}
            onComplete={() => setPlayedIds((prev) => new Set(prev).add(activeItem.id))}
          />
        )}

        {audioUrl && hasPlayed && (
          <div className="mb-4 rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/20 px-5 py-3 text-sm text-[var(--mint-dark)]">
            ✓ Audio finished
          </div>
        )}

        {hasPlayed && activeItem ? (
          <TaskRenderer
            item={activeItem}
            attemptId={attemptId}
            value={answers[activeItem.id]}
            onChange={(answer) => handleAnswerChange(activeItem.id, answer)}
          />
        ) : (
          <p className="text-sm text-[var(--secondary)]">Listen to the audio above to see the question.</p>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-end border-t border-[var(--border-c)] bg-white px-6 py-3">
        {!isLast ? (
          <button
            onClick={goNext}
            disabled={!hasPlayed}
            className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-40"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={finishModule}
            disabled={!hasPlayed || busy}
            className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-40"
          >
            {busy ? "Submitting..." : "Finish this part"}
          </button>
        )}
      </footer>
    </main>
  );
}
