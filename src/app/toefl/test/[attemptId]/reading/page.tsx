"use client";

// TOEFL Reading 응시 화면. docs/toefl-spec.md §10, §11.
// - 전역 네비게이션(Header/Footer) 없이 전체화면으로 그린다(§10 UI 요구사항).
// - 좌 지문 / 우 문항 2단(지문이 있는 문항만; complete_the_words는 지문이 없다).
// - 타이머는 서버가 발급한 deadline_at을 표시만 한다(계산 권위는 서버, §11 1번).
// - 답안은 문항 이동 시 즉시 저장 + 3초 debounce 자동저장(§11 2번).
// - GET current 하나로 최초 진입·새로고침 복구를 모두 처리한다(§11 3번).
// - 학생 응시 화면은 영어만 사용한다(§14).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import SectionDoneActions from "@/components/toefl/SectionDoneActions";
import type { ToeflItemPublic, ToeflStimulusPublic } from "@/lib/toefl/types";

type CurrentResponse = {
  ok: true;
  attempt: { id: string; status: string; mode: string };
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

type Phase = "loading" | "in_module" | "section_done" | "error";

export default function ToeflReadingTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [stimuli, setStimuli] = useState<ToeflStimulusPublic[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [stage, setStage] = useState<"stage1" | "stage2" | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [sectionResult, setSectionResult] = useState<{
    raw_score: number | null;
    scaled_score: number | null;
    band: number | null;
  } | null>(null);
  const [mode, setMode] = useState<string | null>(null);
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
      if (data.attempt.status !== "in_progress") {
        router.replace(`/toefl/report/${attemptId}`);
        return;
      }
      setSectionResult({
        raw_score: data.section.raw_score ?? null,
        scaled_score: data.section.scaled_score ?? null,
        band: data.section.band ?? null,
      });
      setMode(data.attempt.mode);
      setPhase("section_done");
      return;
    }

    setItems(data.items);
    setStimuli(data.stimuli);
    const restored: Record<string, unknown> = {};
    const restoredSaved = new Set<string>();
    for (const [itemId, r] of Object.entries(data.answers)) {
      restored[itemId] = r.answer;
      restoredSaved.add(itemId);
    }
    setAnswers(restored);
    setSavedIds(restoredSaved);
    setDeadlineAt(data.section.deadline_at);
    setStage(data.module?.stage ?? null);
    setMode(data.attempt.mode);
    setActiveIndex(0);
    autoFinishedRef.current = false;
    itemStartRef.current = Date.now();
    setPhase("in_module");
  }, [attemptId, authHeaders, router]);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  // 이탈 방지(§10): 응시 중 탭을 닫거나 새로고침하면 경고한다.
  useEffect(() => {
    if (phase !== "in_module") return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [phase]);

  // 서버 타이머 표시 + 만료 시 자동 제출.
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
    // 3초 debounce 자동저장(§11 2번) — 같은 문항에 대한 이전 타이머는 취소.
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

  async function goTo(index: number) {
    const current = items[activeIndex];
    if (current) await flushPending(current.id);
    itemStartRef.current = Date.now();
    setActiveIndex(index);
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
      const res = await fetch(`/api/toefl/attempts/${attemptId}/sections/reading/finish`, {
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
        // stage2로 라우팅됨 — 다음 모듈을 새로 불러온다(라우팅 결과는 알 수 없다).
        setPhase("loading");
        loadCurrent();
      }
    } catch (e) {
      setErrorMsg(`Failed to finish this part: ${(e as Error).message}`);
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

  if (phase === "section_done") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">Reading section complete</h1>
        <div className="w-full rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6">
          <p className="text-sm text-[var(--secondary)]">Reading band</p>
          <p className="text-4xl font-bold text-[var(--mint-dark)]">{sectionResult?.band ?? "—"}</p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            Scaled score: {sectionResult?.scaled_score ?? "—"} / 30
          </p>
        </div>
        <SectionDoneActions attemptId={attemptId} section="reading" mode={mode} />
      </main>
    );
  }

  const activeItem = items[activeIndex];
  const activeStimulus = activeItem?.stimulus_id
    ? stimuli.find((s) => s.id === activeItem.stimulus_id)
    : null;
  const answeredCount = items.filter((i) => i.id in answers).length;
  const minutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const seconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeLow = remainingMs !== null && remainingMs <= 5 * 60 * 1000;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-c)] bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--foreground)]">TOEFL Reading</p>
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

      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-3">
        {items.map((it, idx) => (
          <button
            key={it.id}
            onClick={() => goTo(idx)}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
              idx === activeIndex
                ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                : it.id in answers
                ? "bg-[var(--mint)] text-[var(--mint-dark)]"
                : "border border-[var(--border-c)] bg-white text-[var(--secondary)]"
            }`}
          >
            {idx + 1}
          </button>
        ))}
        <span className="ml-2 text-xs text-[var(--secondary)]">
          {answeredCount} / {items.length} answered
        </span>
      </div>

      {errorMsg && <p className="mx-auto max-w-3xl px-6 text-sm text-red-600">{errorMsg}</p>}

      <div className="mx-auto grid max-w-3xl gap-6 px-6 pb-24 pt-2 md:grid-cols-2">
        {activeStimulus && (
          <div className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
            {activeStimulus.title && (
              <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{activeStimulus.title}</p>
            )}
            {activeStimulus.body && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">
                {activeStimulus.body}
              </p>
            )}
          </div>
        )}
        <div className={activeStimulus ? "" : "md:col-span-2"}>
          {activeItem && (
            <TaskRenderer
              item={activeItem}
              attemptId={attemptId}
              value={answers[activeItem.id]}
              onChange={(answer) => handleAnswerChange(activeItem.id, answer)}
            />
          )}
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-between border-t border-[var(--border-c)] bg-white px-6 py-3">
        <button
          onClick={() => goTo(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          className="rounded-full border border-[var(--border-c)] px-5 py-2 text-sm text-[var(--foreground)] disabled:opacity-40"
        >
          ← Previous
        </button>
        {activeIndex < items.length - 1 ? (
          <button
            onClick={() => goTo(activeIndex + 1)}
            className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)]"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={finishModule}
            disabled={busy}
            className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Finish this part"}
          </button>
        )}
      </footer>
    </main>
  );
}
