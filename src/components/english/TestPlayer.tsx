"use client";

// 종합평가 재생기. SessionPlayer와 달리 오답을 다시 내지 않는 고정 1회 통과
// 방식이다 — 그래야 "몇 점"이라는 점수가 의미가 있다.
//
// 두 가지 모드로 쓴다:
// - "gate"(유닛 종합평가): 마스터리 비율+점수로 90% 게이트를 판정해
//   unit_progress에 저장. 통과=다음 유닛 열림, 불통과=교정학습 안내.
// - "quick"(세션 미니 점검): 방금 학습 세션에서 다룬 단어만 가볍게 확인.
//   게이트/unit_progress와 무관 — 그냥 "내가 잘 아나" 점검용.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applyAnswer,
  scheduleNext,
  gradeEnKoMc,
  gradeKoEnTyping,
  gradeCloze,
  gradeContrast,
  computeMasteryRatio,
  passesGate,
  type GradeResult,
  type MasteryLevel,
} from "@/lib/engine";
import { createSession, endSession, saveAnswer, saveUnitProgress } from "@/lib/english/session-data";
import { buildItem, toMasteryState, toFsrsState, type CurrentItem, type RunningEntry } from "@/lib/english/build-item";
import type { QueueItem } from "@/lib/english/types";

export default function TestPlayer({
  unitId,
  userId,
  words,
  checkMode = "gate",
  onDone,
}: {
  unitId: string | null;
  userId: string;
  words: QueueItem[];
  checkMode?: "gate" | "quick";
  onDone?: () => void; // "quick" 모드에서 "닫기" 눌렀을 때 (예: 원래 화면으로 복귀)
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [queue] = useState<RunningEntry[]>(() =>
    words.map((q) => ({ ...q, mastery: toMasteryState(q.progress), fsrs: toFsrsState(q.progress) }))
  );
  const [pos, setPos] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<string[]>([]);
  const [levels, setLevels] = useState<Record<string, MasteryLevel>>({});

  const [current, setCurrent] = useState<CurrentItem | null>(() => (queue.length > 0 ? buildItem(queue[0], queue) : null));
  const [itemShownAt, setItemShownAt] = useState<number>(() => Date.now());
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ result: GradeResult; chosenKey: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [gateResult, setGateResult] = useState<{ passed: boolean; testScore: number; masteryRatio: number } | null>(null);

  useEffect(() => {
    createSession(userId, "test", unitId)
      .then(setSessionId)
      .catch((e: unknown) => setSessionError(e instanceof Error ? e.message : "세션을 시작하지 못했습니다."));
  }, [userId, unitId]);

  async function submitAnswer(result: GradeResult, chosenKey: string | null) {
    if (!sessionId || !current || saving) return;
    setSaving(true);
    const responseMs = Date.now() - itemShownAt;
    const entry = queue[pos];

    const { next: nextMastery } = applyAnswer(entry.mastery, { sessionId, isCorrect: result.isCorrect });
    const nextFsrs = scheduleNext(entry.fsrs, result.rating, new Date());

    setLevels((prev) => ({ ...prev, [entry.content.id]: nextMastery.level }));
    if (result.isCorrect) setCorrectCount((c) => c + 1);
    else setWrongWordIds((w) => [...w, entry.content.id]);
    setFeedback({ result, chosenKey });

    try {
      await saveAnswer({
        userId,
        sessionId,
        wordId: entry.content.id,
        itemType: current.itemType,
        isCorrect: result.isCorrect,
        rating: result.rating,
        chosenWordId: null,
        responseMs,
        position: pos,
        nextMastery,
        nextFsrs,
      });
    } finally {
      setSaving(false);
    }
  }

  function handleMcChoice(chosenKey: string) {
    if (feedback || !current) return;
    if (current.itemType === "EN_KO_MC") {
      submitAnswer(gradeEnKoMc(current.item, { chosenKey, responseMs: Date.now() - itemShownAt }), chosenKey);
    } else if (current.itemType === "CONTRAST") {
      submitAnswer(gradeContrast(current.item, { chosenKey, responseMs: Date.now() - itemShownAt }), chosenKey);
    }
  }

  function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (feedback || !current) return;
    if (current.itemType === "KO_EN_TYPE") {
      submitAnswer(gradeKoEnTyping(current.item, { typed, responseMs: Date.now() - itemShownAt }), null);
    } else if (current.itemType === "CLOZE") {
      submitAnswer(gradeCloze(current.item, { typed, responseMs: Date.now() - itemShownAt }), null);
    }
  }

  async function finish() {
    if (sessionId) await endSession(sessionId);
    const finalLevels = queue.map((e) => levels[e.content.id] ?? e.mastery.level);
    const masteryRatio = computeMasteryRatio(finalLevels);
    const testScore = Math.round((correctCount / queue.length) * 100);
    const passed = passesGate({ masteryRatio, testScore });

    // "quick"(세션 미니 점검)은 게이트/unit_progress와 무관 — 저장하지 않는다.
    if (checkMode === "gate" && unitId) {
      await saveUnitProgress(userId, unitId, {
        masteryRatio,
        testScore,
        status: passed ? "passed" : "in_progress",
        cycleCount: 0, // 실패해도 여기선 0 유지 — 실제 사이클 증가는 교정학습 완료 후 재평가에서
      });
    }

    setGateResult({ passed, testScore, masteryRatio });
  }

  function next() {
    const nextPos = pos + 1;
    setTyped("");
    setFeedback(null);
    setItemShownAt(Date.now());
    if (nextPos >= queue.length) {
      setPos(nextPos);
      finish();
      return;
    }
    setPos(nextPos);
    setCurrent(buildItem(queue[nextPos], queue));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (gateResult) return;
      if (feedback) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          next();
        }
        return;
      }
      if (!current) return;
      if (current.itemType === "EN_KO_MC" || current.itemType === "CONTRAST") {
        const n = Number(e.key);
        if (n >= 1 && n <= current.item.options.length) handleMcChoice(current.item.options[n - 1].key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, feedback, gateResult]);

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">평가할 단어가 없어요</h1>
        <Link href="/english" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          ← 영어 학습으로
        </Link>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">시작하지 못했어요</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">{sessionError} 새로고침 후 다시 시도해주세요.</p>
        <Link href="/english" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          ← 영어 학습으로
        </Link>
      </div>
    );
  }

  if (!sessionId) {
    return <div className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-sm text-[var(--secondary)]">준비하는 중...</p></div>;
  }

  if (gateResult && checkMode === "quick") {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">점검 완료 ✅</h1>
        <p className="mt-3 text-[var(--foreground)]">
          방금 배운 단어 <span className="font-bold text-[var(--mint-dark)]">{correctCount} / {queue.length}</span> 개 정답
        </p>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          {wrongWordIds.length > 0
            ? "틀린 단어는 곧 복습으로 다시 만나게 돼요. 오늘도 수고했어요!"
            : "오늘 배운 건 다 기억하고 있네요! 완전히 내 것이 되려면 며칠 더 복습이 필요해요."}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <button
            onClick={() => onDone?.()}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  if (gateResult) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{gateResult.passed ? "통과했어요! 🎉" : "아직이에요"}</h1>
        <p className="mt-3 text-[var(--foreground)]">
          이번 시험 점수 <span className="font-bold text-[var(--mint-dark)]">{gateResult.testScore}점</span> · 완전히 익힌 단어{" "}
          <span className="font-bold text-[var(--mint-dark)]">{Math.round(gateResult.masteryRatio * 100)}%</span>
        </p>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          {gateResult.passed
            ? "90% 게이트를 통과해 다음 유닛이 열렸어요."
            : "시험 점수와 별개로, 단어를 \"완전히 익혔다\"고 인정받으려면 며칠에 걸쳐 여러 번 다른 날 맞혀야 해요(벼락치기 방지). 오늘 점수가 높아도 이제 막 배운 단어라 아직 0%인 게 정상이에요 — 교정학습과 복습을 꾸준히 반복하면 서서히 올라갑니다."}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          {gateResult.passed ? (
            <Link href="/english" className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
              ← 영어 학습으로
            </Link>
          ) : (
            <button
              onClick={() => router.push(`/english/corrective/${unitId}?words=${Array.from(new Set(wrongWordIds)).join(",")}`)}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
            >
              교정학습 시작하기
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!current) return null;
  const entry = queue[pos];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/english" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
        ← 영어 학습으로
      </Link>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--secondary)]">
        <span>유닛 종합평가</span>
        <span>{pos + 1} / {queue.length}</span>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
        {current.itemType === "EN_KO_MC" && (
          <>
            <p className="text-xs text-[var(--secondary)]">다음 단어의 뜻은?</p>
            <p className="mt-2 text-4xl font-semibold text-[var(--foreground)]">{current.item.prompt}</p>
          </>
        )}
        {current.itemType === "CONTRAST" && (
          <>
            <p className="text-xs text-[var(--secondary)]">문맥에 맞는 단어를 고르세요</p>
            <p className="mt-2 text-2xl font-medium text-[var(--foreground)]">{current.item.prompt}</p>
          </>
        )}
        {current.itemType === "KO_EN_TYPE" && (
          <>
            <p className="text-xs text-[var(--secondary)]">뜻을 보고 영어 단어를 입력하세요</p>
            <p className="mt-2 text-2xl font-medium text-[var(--foreground)]">{current.item.prompt}</p>
          </>
        )}
        {current.itemType === "CLOZE" && (
          <>
            <p className="text-xs text-[var(--secondary)]">빈칸에 알맞은 단어를 입력하세요</p>
            <p className="mt-2 text-xl leading-relaxed text-[var(--foreground)]">{current.item.prompt}</p>
          </>
        )}
      </div>

      {(current.itemType === "EN_KO_MC" || current.itemType === "CONTRAST") && (
        <div className="mt-4 space-y-2">
          {current.item.options.map((opt, i) => {
            const isAnswer = opt.key === current.item.correctKey;
            const isChosen = feedback?.chosenKey === opt.key;
            let cls = "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/20";
            if (feedback) {
              if (isAnswer) cls = "border-[var(--mint-dark)] bg-[var(--mint)]/40";
              else if (isChosen) cls = "border-red-400 bg-red-50";
              else cls = "border-[var(--border-c)] bg-white opacity-60";
            }
            return (
              <button
                key={opt.key}
                type="button"
                disabled={!!feedback}
                onClick={() => handleMcChoice(opt.key)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${cls}`}
              >
                <span className="font-semibold text-[var(--secondary)]">{i + 1}</span>
                <span className="text-[var(--foreground)]">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {(current.itemType === "KO_EN_TYPE" || current.itemType === "CLOZE") && !feedback && (
        <form onSubmit={handleTypedSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder="영어 단어 입력"
            className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--pink)]"
          />
          <button type="submit" className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
            확인
          </button>
        </form>
      )}

      {feedback && (
        <div className="mt-4 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-4">
          <p className="text-sm text-[var(--foreground)]">
            {feedback.result.isCorrect ? "✅ 맞았어요" : "❌ 틀렸어요"} · <b>{entry.content.lemma}</b>
          </p>
          {entry.content.senses[0] && <p className="mt-1 text-sm text-[var(--foreground)]">{entry.content.senses[0].meaningKo}</p>}
          <div className="mt-3 flex justify-end">
            <button onClick={next} className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)]">
              {pos + 1 >= queue.length ? "결과 보기" : "다음 (Enter)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
