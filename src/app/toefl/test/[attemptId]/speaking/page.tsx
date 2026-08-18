"use client";

// TOEFL Speaking 응시 화면. docs/toefl-spec.md §6, §10, §11, §12.
// Writing 화면과 골격이 비슷하지만(자유 이동 + AI 채점 대기), 저장하는 게 텍스트가 아니라 녹음
// 파일의 Storage 경로(audio_path)다 — 렌더러가 onChange({audio_path})로 넘겨주면, 이 페이지의
// saveResponse가 그걸 toefl_response.audio_path 전용 컬럼으로 보낸다(answer jsonb에 안 넣음,
// 스키마가 이미 그렇게 분리해뒀다).
// 채점(STT+정확도, 3지표 AI 루브릭)은 finish 호출 시 서버가 처리 — 녹음 파일을 내려받아 Gemini에
// 보내야 해서 Writing보다도 더 걸릴 수 있다.
// 학생 응시 화면은 영어만 사용한다(§14).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import SectionDoneActions from "@/components/toefl/SectionDoneActions";
import ExitTestButton from "@/components/toefl/ExitTestButton";
import { useHasPendingUploads, usePendingUploadTasks, recordingUploadQueue } from "@/lib/toefl/recording-upload-queue";
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
  module: { id: string; position: number } | null;
  items: ToeflItemPublic[];
  stimuli: ToeflStimulusPublic[];
  answers: Record<string, { answer: unknown; time_spent_ms: number | null }>;
};

type Phase = "loading" | "in_module" | "section_done" | "error";

// 뒤로가기 방지(reading/page.tsx의 PAGE_SECTION 주석 참고).
const PAGE_SECTION = "speaking";

export default function ToeflSpeakingTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [answers, setAnswers] = useState<Record<string, { audio_path?: string }>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [timeAnnouncement, setTimeAnnouncement] = useState("");
  const [sectionResult, setSectionResult] = useState<{
    raw_score: number | null;
    scaled_score: number | null;
    band: number | null;
  } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const autoFinishedRef = useRef(false);
  const announcedRef = useRef({ five: false, one: false });
  const hasPendingUploads = useHasPendingUploads();
  const pendingTasks = usePendingUploadTasks();

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
      router.replace("/login?toefl=1");
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

    if (data.section.section !== PAGE_SECTION) {
      router.replace(`/toefl/test/${attemptId}/${data.section.section}`);
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
    const restored: Record<string, { audio_path?: string }> = {};
    for (const [itemId, r] of Object.entries(data.answers)) {
      restored[itemId] = (r.answer as { audio_path?: string } | null) ?? {};
    }
    setAnswers(restored);
    setDeadlineAt(data.section.deadline_at);
    setMode(data.attempt.mode);
    setActiveIndex(0);
    autoFinishedRef.current = false;
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
    announcedRef.current = { five: false, one: false };
    function tick() {
      const rem = new Date(deadlineAt as string).getTime() - Date.now();
      setRemainingMs(rem);
      if (rem > 0 && rem <= 5 * 60 * 1000 && !announcedRef.current.five) {
        announcedRef.current.five = true;
        setTimeAnnouncement("5 minutes remaining.");
      }
      if (rem > 0 && rem <= 60 * 1000 && !announcedRef.current.one) {
        announcedRef.current.one = true;
        setTimeAnnouncement("1 minute remaining.");
      }
      // 시간이 다 됐어도 아직 업로드 중인 녹음이 있으면 자동제출을 미룬다(요청: 미업로드 상태로
      // 제출 차단) — 큐가 백그라운드에서 재시도를 계속하므로 다음 tick에서 다시 확인한다.
      if (rem <= 0 && !autoFinishedRef.current && !recordingUploadQueue.hasPending()) {
        autoFinishedRef.current = true;
        finishModule();
      }
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, deadlineAt]);

  // 녹음 업로드가 끝나야만 호출된다(렌더러가 onChange를 그 시점에만 부름) — 별도 debounce 불필요.
  async function handleRecorded(itemId: string, audioPath: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: { audio_path: audioPath } }));
    const headers = await authHeaders();
    await fetch(`/api/toefl/attempts/${attemptId}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({ responses: [{ item_id: itemId, audio_path: audioPath }] }),
    });
  }

  function goTo(index: number) {
    setActiveIndex(index);
  }

  // AI 채점(STT+루브릭)이 녹음 다운로드까지 포함해 시간이 걸릴 수 있다 — 실패해도 반드시
  // grading/busy를 풀고 에러를 보여준다(writing에서 겪은 멈춤 버그와 같은 패턴 방지).
  async function finishModule() {
    if (recordingUploadQueue.hasPending()) {
      setErrorMsg("Some recordings are still uploading. Please wait for them to finish (or retry below) before submitting.");
      return;
    }
    setBusy(true);
    setGrading(true);
    setErrorMsg(null);
    try {
      const headers = await authHeaders();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 150000);
      let res: Response;
      try {
        res = await fetch(`/api/toefl/attempts/${attemptId}/sections/speaking/finish`, {
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

  if (phase === "loading") {
    return (
      <main data-theme="en" className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--secondary)]">Loading...</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main data-theme="en" className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-[var(--background)]">
        <p className="text-sm text-red-600">{errorMsg}</p>
        <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
          ← Back to TOEFL home
        </button>
      </main>
    );
  }

  if (phase === "section_done") {
    return (
      <main data-theme="en" className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center bg-[var(--background)]">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">Speaking section complete</h1>
        <div className="w-full rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6">
          <p className="text-sm text-[var(--secondary)]">Speaking band</p>
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
        <SectionDoneActions attemptId={attemptId} section="speaking" mode={mode} />
      </main>
    );
  }

  const activeItem = items[activeIndex];
  const answeredCount = items.filter((i) => answers[i.id]?.audio_path).length;
  const minutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const seconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeLow = remainingMs !== null && remainingMs <= 5 * 60 * 1000;

  if (grading) {
    return (
      <main data-theme="en" className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center bg-[var(--background)]">
        <p className="text-sm font-medium text-[var(--foreground)]">Grading your speaking…</p>
        <p className="text-xs text-[var(--secondary)]">This can take up to a couple of minutes. Please don't close this tab.</p>
      </main>
    );
  }

  return (
    <main data-theme="en" className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-c)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <ExitTestButton />
          <p className="text-sm font-medium text-[var(--foreground)]">TOEFL Speaking</p>
        </div>
        <p
          aria-live="off"
          className={`text-sm font-semibold ${timeLow ? "text-red-600" : "text-[var(--foreground)]"}`}
        >
          {timeLow && (
            <span aria-hidden="true">⚠ </span>
          )}
          {minutes !== null ? `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : "--:--"}
        </p>
        <p aria-live="assertive" className="sr-only">
          {timeAnnouncement}
        </p>
      </header>

      <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto px-6 py-3">
        {items.map((it, idx) => (
          <button
            key={it.id}
            onClick={() => goTo(idx)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
              idx === activeIndex
                ? "bg-[var(--pink-dark)] text-white"
                : answers[it.id]?.audio_path
                ? "bg-[var(--mint)] text-[var(--mint-dark)]"
                : "border border-[var(--border-c)] bg-white text-[var(--secondary)]"
            }`}
          >
            {idx + 1}
          </button>
        ))}
        <span className="ml-2 shrink-0 whitespace-nowrap text-xs text-[var(--secondary)]">
          {answeredCount} / {items.length} recorded
        </span>
      </div>

      {errorMsg && <p className="mx-auto max-w-3xl px-6 text-sm text-red-600">{errorMsg}</p>}

      {pendingTasks.length > 0 && (
        <div className="mx-auto max-w-3xl px-6 pt-2">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-medium">
              {pendingTasks.length} recording{pendingTasks.length > 1 ? "s" : ""} still uploading — you can&apos;t submit until
              this finishes.
            </p>
            <ul className="mt-1.5 space-y-1">
              {pendingTasks.map((t) => {
                const idx = items.findIndex((it) => it.id === t.itemId);
                return (
                  <li key={t.itemId} className="flex items-center gap-2">
                    <span>
                      Item {idx >= 0 ? idx + 1 : "?"}: {t.status === "failed" ? "upload failed" : "retrying…"}
                    </span>
                    {t.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => recordingUploadQueue.retryNow(t.itemId)}
                        className="rounded-full border border-amber-400 px-2 py-0.5 font-medium text-amber-900"
                      >
                        Retry now
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-2">
        {activeItem && (
          <TaskRenderer
            key={activeItem.id}
            item={activeItem}
            attemptId={attemptId}
            value={answers[activeItem.id]}
            onChange={(answer) => handleRecorded(activeItem.id, (answer as { audio_path: string }).audio_path)}
            turnIndex={interviewTurnIndex(items, activeItem.id)}
            turnTotal={items.filter((it) => it.task_type === "take_an_interview").length}
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
            className="rounded-full bg-[var(--pink-dark)] px-6 py-2 text-sm font-medium text-white"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={finishModule}
            disabled={busy || hasPendingUploads}
            className="rounded-full bg-[var(--pink-dark)] px-6 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Grading..." : hasPendingUploads ? "Uploading…" : "Finish this part"}
          </button>
        )}
      </footer>
    </main>
  );
}

// take_an_interview 문항이 이 섹션에서 몇 번째 턴인지(0-based) — 같은 task_type 문항들만
// 걸러서 순서를 매긴다(position 자체는 다른 유형과 섞여 있어 그대로 못 씀).
function interviewTurnIndex(items: ToeflItemPublic[], itemId: string): number | undefined {
  const interviewItems = items.filter((it) => it.task_type === "take_an_interview");
  const idx = interviewItems.findIndex((it) => it.id === itemId);
  return idx === -1 ? undefined : idx;
}
