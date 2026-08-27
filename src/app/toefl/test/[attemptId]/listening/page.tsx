"use client";

// TOEFL Listening 응시 화면. docs/toefl-spec.md §6, §10, §11.
// Reading 화면(test/[attemptId]/reading/page.tsx)과 상태관리 골격(로딩·타이머·자동저장·finish/submit)이
// 상당히 겹친다 — 다만 지금은 페이지가 2개뿐이라 공용 훅으로 뽑지 않았다(세 번째 영역이 생기는 P3/P4에서
// 반복이 뚜렷해지면 그때 추출하는 게 낫다고 판단, "규칙의 3법칙").
// Listening 고유 규칙(§6, §10):
// - 재생 완료 전 문항 노출 금지 → 이제 각 Listening 태스크 컴포넌트가 스스로 지킨다(2026-08-18
//   재작업 전엔 이 페이지가 AudioPlayer+hasPlayed를 직접 들고 있었음). 페이지는 onAudioEnded
//   콜백으로 "다음/제출" 버튼을 언제 풀지만 안다.
// - 재생은 1회 → AudioPlayer 자체가 재생 버튼을 1번만 허용(재생 컨트롤 없음).
// - 뒤로 가기 불가 → Reading과 달리 문항 네비게이터가 클릭 불가(진행 표시만), Previous 버튼 없음.
// - 학생 응시 화면은 영어만 사용한다(§14).

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import SectionDoneActions from "@/components/toefl/SectionDoneActions";
import ExitTestButton from "@/components/toefl/ExitTestButton";
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

// 뒤로가기 방지(reading/page.tsx의 PAGE_SECTION 주석 참고).
const PAGE_SECTION = "listening";

export default function ToeflListeningTestPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [stimuli, setStimuli] = useState<ToeflStimulusPublic[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // 오디오 재생 게이트는 이제 각 태스크 컴포넌트가 스스로 관리한다 — 페이지는 "현재 문항의
  // 오디오가 끝났는지"만 알면 되므로 Set이 아니라 문항 하나짜리 플래그로 충분하다(전엔
  // playedIds: Set<string>으로 전체 문항을 추적했음).
  const [audioEnded, setAudioEnded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [stage, setStage] = useState<"stage1" | "stage2" | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [timeAnnouncement, setTimeAnnouncement] = useState("");
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
  const announcedRef = useRef({ five: false, one: false });

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
    // 이미 답한 문항으로 새로고침 복구된 거라면 재생도 끝난 상태였을 것이다 — 첫 문항(0번,
    // 항상 여기서 복구 시작함) 기준으로 판단한다.
    setAudioEnded(data.items[0] ? data.items[0].id in restored : false);
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
    // 다음 문항은 아직 안 들었으니 다시 잠근다. 이미 답이 있다면(드물게 재방문 등) 이미
    // 들은 것으로 본다 — restore 로직과 같은 판단 기준.
    const next = items[activeIndex + 1];
    setAudioEnded(next ? next.id in answers : false);
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
        <h1 className="text-2xl font-medium text-[var(--foreground)]">Listening section complete</h1>
        <div className="w-full rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6">
          <p className="text-sm text-[var(--secondary)]">Listening band</p>
          <p className="text-4xl font-bold text-[var(--mint-dark)]">{sectionResult?.band ?? "—"}</p>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            Scaled score: {sectionResult?.scaled_score ?? "—"} / 30
          </p>
        </div>
        <SectionDoneActions attemptId={attemptId} section="listening" mode={mode} />
      </main>
    );
  }

  const activeItem = items[activeIndex];
  const activeStimulus = activeItem?.stimulus_id ? stimuli.find((s) => s.id === activeItem.stimulus_id) : null;
  const minutes = remainingMs !== null ? Math.max(0, Math.floor(remainingMs / 60000)) : null;
  const seconds = remainingMs !== null ? Math.max(0, Math.floor((remainingMs % 60000) / 1000)) : null;
  const timeLow = remainingMs !== null && remainingMs <= 5 * 60 * 1000;
  const isLast = activeIndex >= items.length - 1;

  return (
    <main data-theme="en" className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border-c)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <ExitTestButton />
          <p className="text-sm font-medium text-[var(--foreground)]">TOEFL Listening</p>
          {stage && (
            <span className="rounded-full bg-[var(--mint)]/40 px-2.5 py-0.5 text-xs font-medium text-[var(--mint-dark)]">
              Part {stage === "stage1" ? 1 : 2} of 2
            </span>
          )}
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

      {/* 화면 검토(2026-08-27) [C]: 규칙 자체는 이미 기계적으로 강제되지만(재생버튼 1회,
          Previous 없음), 학생에게 명시적으로 알려준 적은 없었다 — 문구로도 밝혀둔다. */}
      <p className="mx-auto max-w-2xl px-6 pt-2 text-xs text-[var(--secondary)]">
        ⓘ Each audio clip plays once. You can&apos;t go back to a previous question in this section.
      </p>

      {/* 진행 표시 전용(클릭 불가) — Listening은 뒤로 가기가 없다 */}
      <div className="mx-auto flex max-w-2xl items-center gap-2 overflow-x-auto px-6 py-3">
        {items.map((it, idx) => (
          <span
            key={it.id}
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              idx === activeIndex
                ? "bg-[var(--pink)]"
                : idx < activeIndex
                ? "bg-[var(--mint)]"
                : "border border-[var(--border-c)]"
            }`}
          />
        ))}
        <span className="ml-2 shrink-0 whitespace-nowrap text-xs text-[var(--secondary)]">
          Item {activeIndex + 1} of {items.length}
        </span>
      </div>

      {errorMsg && <p className="mx-auto max-w-2xl px-6 text-sm text-red-600">{errorMsg}</p>}

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-2">
        {/* 지문·오디오·재생게이트·화자아이콘·노트패널 전부 이제 태스크 컴포넌트가 스스로
            그린다(2026-08-18 재작업) — 여기선 안 그린다. onAudioEnded가 오면 다음/제출
            버튼을 풀어준다. */}
        {activeItem && (
          <TaskRenderer
            key={activeItem.id}
            item={activeItem}
            attemptId={attemptId}
            stimulus={activeStimulus}
            value={answers[activeItem.id]}
            onChange={(answer) => handleAnswerChange(activeItem.id, answer)}
            onAudioEnded={() => setAudioEnded(true)}
          />
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-end border-t border-[var(--border-c)] bg-white px-6 py-3">
        {!isLast ? (
          <button
            onClick={goNext}
            disabled={!audioEnded}
            className="rounded-full bg-[var(--pink-dark)] px-6 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={finishModule}
            disabled={!audioEnded || busy}
            className="rounded-full bg-[var(--pink-dark)] px-6 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Submitting..." : "Finish this part"}
          </button>
        )}
      </footer>
    </main>
  );
}
