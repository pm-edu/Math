"use client";

// 유닛 종합평가(90% 게이트). SessionPlayer와 달리 오답을 다시 내지 않는
// 고정 1회 통과 방식이다 — 그래야 "몇 점"이라는 점수가 의미가 있다.
// 끝나면 마스터리 비율+점수로 게이트를 판정해 unit_progress에 저장하고,
// 불통과면 교정학습(다음 단계)으로 안내한다.

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
}: {
  unitId: string;
  userId: string;
  words: QueueItem[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
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
    createSession(userId, "test", unitId).then(setSessionId).catch(() => setSessionId(null));
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

    await saveUnitProgress(userId, unitId, {
      masteryRatio,
      testScore,
      status: passed ? "passed" : "in_progress",
      cycleCount: 0, // 실패해도 여기선 0 유지 — 실제 사이클 증가는 교정학습 완료 후 재평가에서
    });

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

  if (gateResult) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{gateResult.passed ? "통과했어요! 🎉" : "아직이에요"}</h1>
        <p className="mt-3 text-[var(--foreground)]">
          점수 <span className="font-bold text-[var(--mint-dark)]">{gateResult.testScore}점</span> · 마스터리{" "}
          <span className="font-bold text-[var(--mint-dark)]">{Math.round(gateResult.masteryRatio * 100)}%</span>
        </p>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          {gateResult.passed ? "90% 게이트를 통과해 다음 유닛이 열렸어요." : "90% 게이트(마스터리·점수 둘 다 90% 이상)를 아직 못 넘었어요. 교정학습으로 약한 단어만 다시 다져봐요."}
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
