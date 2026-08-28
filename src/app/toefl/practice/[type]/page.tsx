"use client";

// 유형별 연습(2026-08-28) — 랜딩(/toefl §types)에서 문항 유형 하나를 골라 들어오는 화면.
// 정식 응시(test/[attemptId]/...)와 완전히 분리된 가벼운 모드: 타이머·적응형 라우팅·영역점수
// 전혀 없고, 문항 하나 풀 때마다 바로 채점 결과(맞았는지·해설)를 보여준다("연습"이 목적이라
// §5의 "응시 중 정답 노출 금지"는 여기 적용 대상이 아니다 — 정식 응시 화면에만 적용됨).
// /toefl/sample과 같은 이유로 영어 고정 화면이다(spec §14, showLanguageToggle={false}).
//
// 로그인 없이도 전부 열려 있다(toefl-subsystem-plan 메모 2026-08-28 결정) — 게스트는
// localStorage 기반 guestId(익명 로그인 아님, [[toefl-subsystem-plan]] 2026-08-15 롤백 결정
// 참고)로 연습 기록을 구분한다. Speaking 두 유형(오디오)은 정식 응시처럼 Storage에 올리지
// 않고 녹음을 그대로 서버에 보내 채점 후 버린다 — 게스트는 toefl-recordings 버킷 RLS를
// 통과할 수 없어서(경로 첫 세그먼트=user_id 강제) 애초에 영구 저장 자체를 안 하는 쪽을 택함.

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { useRecorder } from "@/components/toefl/useRecorder";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateGuestId } from "@/lib/toefl/guest-id";
import { isToeflTaskType, TASK_TYPE_LABELS } from "@/lib/toefl/task-types";
import type { ToeflItemPublic, ToeflStimulusPublic, ToeflTaskType } from "@/lib/toefl/types";

const AUDIO_TASK_TYPES = new Set<ToeflTaskType>(["listen_and_repeat", "take_an_interview"]);

type ScoreResult = {
  ok: boolean;
  isCorrect: boolean | null;
  pointsEarned: number;
  maxPoints: number;
  feedbackKo: string | null;
  explanationKo: string | null;
  error: string | null;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ToeflPracticePage() {
  const params = useParams<{ type: string }>();
  const router = useRouter();
  const typeParam = params.type;

  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [stimuli, setStimuli] = useState<ToeflStimulusPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!isToeflTaskType(typeParam)) return;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/toefl/practice/${typeParam}`)
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setItems(data.items ?? []);
        setStimuli(data.stimuli ?? []);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [typeParam, round]);

  if (!isToeflTaskType(typeParam)) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader showLanguageToggle={false} />
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-sm text-[var(--secondary)]">Unknown task type.</p>
          <Link href="/toefl" className="mt-4 inline-block text-sm text-[var(--pink-dark)] underline">
            ← Back to TOEFL
          </Link>
        </main>
      </div>
    );
  }

  const label = TASK_TYPE_LABELS[typeParam];
  const stimulusById = new Map(stimuli.map((s) => [s.id, s]));

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader showLanguageToggle={false} />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pink-dark)]">{label.section} · Practice</p>
        <h1 className="mt-1 text-3xl font-medium text-[var(--foreground)]">{label.en}</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          Answer each question to see if you got it right, right away. Nothing here affects a real attempt&apos;s score.
        </p>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">Loading...</p>
        ) : loadError ? (
          <p className="mt-10 text-sm text-red-600">Couldn&apos;t load practice questions. Please try again shortly.</p>
        ) : items.length === 0 ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">No questions of this type are available yet.</p>
        ) : (
          <div className="mt-8 space-y-6">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                {AUDIO_TASK_TYPES.has(item.task_type) ? (
                  <AudioPracticeItem item={item} />
                ) : (
                  <TextPracticeItem item={item} stimulus={stimulusById.get(item.stimulus_id ?? "") ?? null} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--border-c)] pt-8 text-center">
          <button
            onClick={() => setRound((r) => r + 1)}
            className="rounded-full border border-[var(--border-c)] px-6 py-3 text-sm font-semibold text-[var(--foreground)]"
          >
            Try another set
          </button>
          <button onClick={() => router.push("/toefl/start")} className="text-sm text-[var(--secondary)] underline">
            Practice by section instead →
          </button>
          <Link href="/toefl#types" className="text-xs text-[var(--secondary)]">
            ← All 12 task types
          </Link>
        </div>
      </main>
    </div>
  );
}

function ResultPanel({ result }: { result: ScoreResult }) {
  if (result.error) {
    return <p className="mt-3 text-sm text-red-600">⚠ {result.error}</p>;
  }
  return (
    <div className="mt-3 rounded-xl bg-[var(--background)] p-4">
      {result.isCorrect !== null ? (
        <p className={`text-sm font-semibold ${result.isCorrect ? "text-[var(--mint-dark)]" : "text-red-600"}`}>
          {result.isCorrect ? "✓ Correct" : "✗ Not quite"} — {result.pointsEarned}/{result.maxPoints} pts
        </p>
      ) : (
        <p className="text-sm font-semibold text-[var(--foreground)]">
          Score: {result.pointsEarned}/{result.maxPoints} pts
        </p>
      )}
      {result.explanationKo && <p className="mt-2 text-sm text-[var(--secondary)]">{result.explanationKo}</p>}
      {result.feedbackKo && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--secondary)]">{result.feedbackKo}</p>}
    </div>
  );
}

function TextPracticeItem({ item, stimulus }: { item: ToeflItemPublic; stimulus: ToeflStimulusPublic | null }) {
  const [answer, setAnswer] = useState<unknown>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  async function handleCheck() {
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const body: Record<string, unknown> = { itemId: item.id, answer };
      if (!("Authorization" in headers)) body.guestId = getOrCreateGuestId();
      const res = await fetch("/api/toefl/practice/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(res.ok ? data : { ...data, ok: false, error: data.message ?? "Something went wrong." });
    } catch {
      setResult({ ok: false, isCorrect: null, pointsEarned: 0, maxPoints: item.points, feedbackKo: null, explanationKo: null, error: "Network error." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <TaskRenderer item={item} attemptId="practice" stimulus={stimulus} value={answer} onChange={setAnswer} />
      {!result && (
        <button
          onClick={handleCheck}
          disabled={submitting || answer === undefined}
          className="mt-4 rounded-full bg-[var(--pink-dark)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Check answer"}
        </button>
      )}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

function AudioPracticeItem({ item }: { item: ToeflItemPublic }) {
  const recorder = useRecorder();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  async function handleStop() {
    const blob = await recorder.stop();
    if (!blob) return;
    setSubmitting(true);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.append("itemId", item.id);
      if (!("Authorization" in headers)) form.append("guestId", getOrCreateGuestId());
      form.append("audio", blob, `recording.${recorder.ext}`);
      const res = await fetch("/api/toefl/practice/score", { method: "POST", headers, body: form });
      const data = await res.json();
      setResult(res.ok ? data : { ...data, ok: false, error: data.message ?? "Something went wrong." });
    } catch {
      setResult({ ok: false, isCorrect: null, pointsEarned: 0, maxPoints: item.points, feedbackKo: null, explanationKo: null, error: "Network error." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      {recorder.state === "error" && recorder.error && <p className="mt-3 text-sm text-red-600">⚠ {recorder.error}</p>}

      {!result && recorder.state !== "error" && (
        <div className="mt-4">
          {recorder.state === "recording" ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-red-600">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
                Recording…
              </div>
              <button onClick={handleStop} className="mt-3 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white">
                Stop &amp; check
              </button>
            </>
          ) : (
            <button
              onClick={() => recorder.start()}
              disabled={submitting}
              className="rounded-full bg-[var(--pink-dark)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Grading…" : "● Record my answer"}
            </button>
          )}
        </div>
      )}

      {result && <ResultPanel result={result} />}
    </div>
  );
}
