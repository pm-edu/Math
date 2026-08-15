"use client";

// TOEFL Writing 응시 화면. docs/toefl-spec.md §6, §10, §11, §12.
// Reading 화면과 상태관리 골격이 겹치지만(§12 finish 상세는 다름) 아직 공용 훅으로 안 뽑았다
// (reading/listening/writing page.tsx 3개가 됐지만, 서로 조금씩 달라서 — Reading은 지문 2단+
// 자유 이동, Listening은 오디오 게이트+선형 진행, Writing은 지문 없이 자유 이동 — 억지로 하나의
// 훅에 욱여넣기보다 지금은 각자 명확하게 두는 게 낫다고 판단. 나중에 Speaking까지 만들고 나서
// 진짜 공통부분이 뭔지 보이면 그때 추출한다).
// Writing 고유: build_a_sentence는 자동채점, write_an_email/academic_discussion은 AI 루브릭
// 채점(§12) — finish 호출 시 서버가 Gemini로 채점하므로 몇 초 걸릴 수 있다("채점 중" 표시).
// 학생 응시 화면은 영어만 사용한다(§14).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskRenderer from "@/components/toefl/TaskRenderer";
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
  module: { id: string; position: number } | null;
  items: ToeflItemPublic[];
  stimuli: ToeflStimulusPublic[];
  answers: Record<string, { answer: unknown; time_spent_ms: number | null }>;
};

type Phase = "loading" | "in_module" | "section_done" | "submitted" | "error";

export default function ToeflWritingTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [sectionResult, setSectionResult] = useState<{
    raw_score: number | null;
    scaled_score: number | null;
    band: number | null;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [overall, setOverall] = useState<{ total_scaled: number; band: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);

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
    const restored: Record<string, unknown> = {};
    const restoredSaved = new Set<string>();
    for (const [itemId, r] of Object.entries(data.answers)) {
      restored[itemId] = r.answer;
      restoredSaved.add(itemId);
    }
    setAnswers(restored);
    setSavedIds(restoredSaved);
    setDeadlineAt(data.section.deadline_at);
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

  async function goTo(index: number) {
    const current = items[activeIndex];
    if (current) await flushPending(current.id);
    itemStartRef.current = Date.now();
    setActiveIndex(index);
  }

  // AI 채점(§12)이 여기서 동기로 돌아서 시간이 꽤 걸릴 수 있다 — 네트워크 오류·서버 타임아웃 등
  // 어떤 이유로든 실패하면 반드시 grading/busy를 풀고 에러를 보여준다(try/catch 없으면 "Grading..."
  // 화면에서 영원히 멈춰버리는 버그가 있었음, 실사용 중 발견됨).
  async function finishModule() {
    setBusy(true);
    setGrading(true);
    setErrorMsg(null);
    try {
      const current = items[activeIndex];
      if (current) await flushPending(current.id);

      const headers = await authHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // AI 채점 대기 상한 2분
      let res: Response;
      try {
        res = await fetch(`/api/toefl/attempts/${attemptId}/sections/writing/finish`, {
          method: "POST",
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.message ?? "Failed to finish this part.");
        return;
      }
      setWarnings(data.warnings ?? []);
      setSectionResult({ raw_score: data.raw_score, scaled_score: data.scaled_score, band: data.band });
      setPhase("section_done");
    } catch (e) {
      const err = e as Error;
      setErrorMsg(
        err.name === "AbortError"
          ? "Grading is taking too long and timed out. Please try again."
          : `Failed to finish this part: ${err.message}`
      );
    } finally {
      setBusy(false);
      setGrading(false);
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
          {phase === "submitted" ? "Result" : "Writing section complete"}
        </h1>
        <div className="w-full rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6">
          <p className="text-sm text-[var(--secondary)]">Writing band</p>
          <p className="text-4xl font-bold text-[var(--mint-dark)]">{sectionResult?.band ?? "—"}</p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            Scaled score: {sectionResult?.scaled_score ?? "—"} / 30
          </p>
        </div>
        {warnings.length > 0 && (
          <div className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-xs text-amber-800">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
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
  const answeredCount = items.filter((i) => i.id in answers).length;
  const minutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const seconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeLow = remainingMs !== null && remainingMs <= 5 * 60 * 1000;

  if (grading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-[var(--foreground)]">Grading your writing…</p>
        <p className="text-xs text-[var(--secondary)]">This can take up to a minute. Please don't close this tab.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-c)] bg-white px-6 py-3">
        <p className="text-sm font-medium text-[var(--foreground)]">TOEFL Writing</p>
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

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-2">
        {activeItem && (
          <TaskRenderer
            item={activeItem}
            value={answers[activeItem.id]}
            onChange={(answer) => handleAnswerChange(activeItem.id, answer)}
          />
        )}
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
            {busy ? "Grading..." : "Finish this part"}
          </button>
        )}
      </footer>
    </main>
  );
}
