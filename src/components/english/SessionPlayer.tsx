"use client";

// 영어 완전학습 세션 플레이어. /english/learn, /english/review가 공유해서 쓴다.
// 문항 하나하나를 내고, 채점하고, 엔진(사다리+FSRS)을 적용해 저장한 뒤 다음으로 넘어간다.
// 키보드: MC/대조 문항은 숫자키로 선택, 타이핑/빈칸은 Enter로 제출, 피드백 화면은
// Enter/Space로 다음 문항.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  applyAnswer,
  initialMasteryState,
  scheduleNext,
  pickItemTypeForLevel,
  generateEnKoMc,
  gradeEnKoMc,
  generateKoEnTyping,
  gradeKoEnTyping,
  generateCloze,
  gradeCloze,
  generateContrast,
  gradeContrast,
  type MasteryState,
  type FsrsState,
  type ItemType,
  type GradeResult,
  type EnKoMcItem,
  type KoEnTypingItem,
  type ClozeItem,
  type ContrastItem,
} from "@/lib/engine";
import { createSession, endSession, saveAnswer } from "@/lib/english/session-data";
import type { QueueItem, SessionMode } from "@/lib/english/types";

type CurrentItem =
  | { itemType: "EN_KO_MC"; item: EnKoMcItem; pool: Array<{ id: string; meaning: string }> }
  | { itemType: "KO_EN_TYPE"; item: KoEnTypingItem }
  | { itemType: "CLOZE"; item: ClozeItem }
  | { itemType: "CONTRAST"; item: ContrastItem; confusionPartnerWordId: string };

type RunningEntry = QueueItem & {
  mastery: MasteryState;
  fsrs: FsrsState | null;
};

function toMasteryState(progress: QueueItem["progress"]): MasteryState {
  if (!progress) return initialMasteryState();
  return {
    level: progress.level as MasteryState["level"],
    consecutiveWrong: progress.consecutiveWrong,
    consecutiveCorrect: progress.consecutiveCorrect,
    lastSessionId: progress.lastSessionId,
  };
}

function toFsrsState(progress: QueueItem["progress"]): FsrsState | null {
  if (!progress || progress.stability === null || progress.difficulty === null) return null;
  return { stability: progress.stability, difficulty: progress.difficulty, dueAt: new Date().toISOString() };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 문항 생성. entry+pool만으로 결과가 정해지는 순수 함수라 컴포넌트 밖에 둔다
// (훅으로 감쌀 이유가 없다 — useCallback/useMemo/ref 없이도 안전하게 쓸 수 있다).
function buildItem(entry: RunningEntry, pool: RunningEntry[]): CurrentItem {
  const primarySense = entry.content.senses[0];
  const primaryExample = entry.content.examples[0];
  const hasUsableConfusion = !!entry.confusionPartner && !!primaryExample;

  const itemType: ItemType = pickItemTypeForLevel(entry.mastery.level, {
    hasConfusionPartner: hasUsableConfusion,
    rng: Math.random,
  });

  if (itemType === "CONTRAST" && entry.confusionPartner && primaryExample) {
    const item = generateContrast({
      target: { lemma: entry.content.lemma, exampleEn: primaryExample.textEn },
      confusedWith: { lemma: entry.confusionPartner.lemma },
    });
    // 정답(target)이 항상 첫 보기로 나오지 않도록 화면에 보여줄 순서를 섞는다.
    return {
      itemType: "CONTRAST",
      item: { ...item, options: shuffle(item.options) },
      confusionPartnerWordId: entry.confusionPartner.wordId,
    };
  }

  if (itemType === "CLOZE" && primaryExample) {
    const item = generateCloze({ lemma: entry.content.lemma, exampleEn: primaryExample.textEn });
    return { itemType: "CLOZE", item };
  }

  if (itemType === "KO_EN_TYPE" || (itemType === "CLOZE" && !primaryExample)) {
    const item = generateKoEnTyping({ lemma: entry.content.lemma, meaning: primarySense?.meaningKo ?? "" });
    return { itemType: "KO_EN_TYPE", item };
  }

  // EN_KO_MC (기본값 — 대조/빈칸 조건을 못 채웠을 때도 여기로 온다)
  const candidatePool = pool
    .filter((p) => p.content.id !== entry.content.id && p.content.senses[0])
    .map((p) => ({ id: p.content.id, meaning: p.content.senses[0].meaningKo }));
  const item = generateEnKoMc(
    { lemma: entry.content.lemma, meaning: primarySense?.meaningKo ?? "" },
    candidatePool.map((c) => ({
      item: c,
      key: c.meaning,
      isConfusion: c.id === entry.confusionPartner?.wordId,
    }))
  );
  // 정답이 항상 첫 보기로 나오지 않도록 화면에 보여줄 순서를 섞는다.
  return { itemType: "EN_KO_MC", item: { ...item, options: shuffle(item.options) }, pool: candidatePool };
}

export default function SessionPlayer({
  mode,
  unitId,
  userId,
  initialQueue,
  backHref,
  backLabel,
}: {
  mode: SessionMode;
  unitId: string | null;
  userId: string;
  initialQueue: QueueItem[];
  backHref: string;
  backLabel: string;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<RunningEntry[]>(() =>
    initialQueue.map((q) => ({ ...q, mastery: toMasteryState(q.progress), fsrs: toFsrsState(q.progress) }))
  );
  const [pos, setPos] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [positionCounter, setPositionCounter] = useState(0);

  // current는 pos가 바뀔 때(next()에서, 또는 최초 마운트 시)만 새로 만든다.
  // 문항 유형·오답 선택지에 무작위 요소가 있어, 매 렌더마다 다시 만들면
  // 화면에 보이는 문제가 답하는 도중에 바뀌어버린다.
  const [current, setCurrent] = useState<CurrentItem | null>(() => (queue.length > 0 ? buildItem(queue[0], queue) : null));
  const [itemShownAt, setItemShownAt] = useState<number>(() => Date.now());
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ result: GradeResult; chosenWordId: string | null; chosenKey: string | null } | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createSession(userId, mode, unitId).then(setSessionId).catch(() => setSessionId(null));
  }, [userId, mode, unitId]);

  async function submitAnswer(result: GradeResult, chosenWordId: string | null, chosenKey: string | null) {
    if (!sessionId || !current || saving) return;
    setSaving(true);
    const responseMs = Date.now() - itemShownAt;
    const entry = queue[pos];

    const { next: nextMastery } = applyAnswer(entry.mastery, { sessionId, isCorrect: result.isCorrect });
    const nextFsrs = scheduleNext(entry.fsrs, result.rating, new Date());

    setStats((s) => ({ correct: s.correct + (result.isCorrect ? 1 : 0), total: s.total + 1 }));
    setFeedback({ result, chosenWordId, chosenKey });

    try {
      await saveAnswer({
        userId,
        sessionId,
        wordId: entry.content.id,
        itemType: current.itemType,
        isCorrect: result.isCorrect,
        rating: result.rating,
        chosenWordId,
        responseMs,
        position: positionCounter,
        nextMastery,
        nextFsrs,
      });
    } finally {
      setSaving(false);
    }
    setPositionCounter((p) => p + 1);

    setQueue((prev) => {
      const updated = [...prev];
      updated[pos] = { ...entry, mastery: nextMastery, fsrs: nextFsrs };
      if (!result.isCorrect) {
        updated.push(updated[pos]); // 틀렸으면 세션 끝에 다시
      }
      return updated;
    });
  }

  function handleMcChoice(chosenKey: string) {
    if (feedback || !current) return;
    if (current.itemType === "EN_KO_MC") {
      const result = gradeEnKoMc(current.item, { chosenKey, responseMs: Date.now() - itemShownAt });
      const chosenWordId = current.pool.find((p) => p.meaning === chosenKey)?.id ?? null;
      submitAnswer(result, result.isCorrect ? null : chosenWordId, chosenKey);
    } else if (current.itemType === "CONTRAST") {
      const result = gradeContrast(current.item, { chosenKey, responseMs: Date.now() - itemShownAt });
      const chosenWordId = result.isCorrect ? null : current.confusionPartnerWordId;
      submitAnswer(result, chosenWordId, chosenKey);
    }
  }

  function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (feedback || !current) return;
    if (current.itemType === "KO_EN_TYPE") {
      submitAnswer(gradeKoEnTyping(current.item, { typed, responseMs: Date.now() - itemShownAt }), null, null);
    } else if (current.itemType === "CLOZE") {
      submitAnswer(gradeCloze(current.item, { typed, responseMs: Date.now() - itemShownAt }), null, null);
    }
  }

  async function finishSession() {
    if (sessionId) await endSession(sessionId);
  }

  function next() {
    const nextPos = pos + 1;
    setPos(nextPos);
    setCurrent(nextPos < queue.length ? buildItem(queue[nextPos], queue) : null);
    setTyped("");
    setFeedback(null);
    setItemShownAt(Date.now());
  }

  // 키보드 단축키: MC/대조는 숫자키, 피드백 화면은 Enter/Space로 다음
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (pos >= queue.length) return;
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
        const options = current.item.options;
        if (n >= 1 && n <= options.length) {
          handleMcChoice(options[n - 1].key);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, feedback, pos, queue.length]);

  const finished = pos >= queue.length;

  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">
          {mode === "learn" ? "새로 배울 단어가 없어요" : "복습할 단어가 없어요"}
        </h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">
          {mode === "learn" ? "이 유닛은 이미 다 시작했어요. 복습으로 이어가 보세요." : "잘하고 있어요! 나중에 다시 확인해보세요."}
        </p>
        <Link href={backHref} className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          {backLabel}
        </Link>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">학습 완료 🎉</h1>
        <p className="mt-3 text-[var(--foreground)]">
          이번 세션 <span className="font-bold text-[var(--mint-dark)]">{stats.correct} / {stats.total} 정답</span>
        </p>
        <p className="mt-2 text-sm text-[var(--secondary)]">틀린 단어는 다시 나왔고, 진도는 저장됐어요.</p>
        <Link
          href={backHref}
          onClick={() => finishSession()}
          className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  if (!current) return null;

  const entry = queue[pos];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href={backHref} onClick={() => finishSession()} className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
        {backLabel}
      </Link>

      <div className="mt-4 flex items-center justify-between text-sm text-[var(--secondary)]">
        <span>{mode === "learn" ? "새 단어 배우기" : "복습"}</span>
        <span>{pos + 1} / {queue.length}</span>
      </div>

      {/* 문항 본문 */}
      <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
        {current.itemType === "EN_KO_MC" && (
          <>
            <p className="text-xs text-[var(--secondary)]">다음 단어의 뜻은?</p>
            <p className="mt-2 text-4xl font-semibold text-[var(--foreground)]">{current.item.prompt}</p>
            {entry.content.pos && <p className="mt-1 text-sm text-[var(--secondary)]">{entry.content.pos}</p>}
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

      {/* 응답 UI */}
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

      {/* 채점 피드백 */}
      {feedback && (
        <div className="mt-4 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-4">
          <p className="text-sm text-[var(--foreground)]">
            {feedback.result.isCorrect ? "✅ 맞았어요" : "❌ 틀렸어요"} · <b>{entry.content.lemma}</b>
            {entry.content.pos && <span className="text-[var(--secondary)]"> ({entry.content.pos})</span>}
          </p>
          {entry.content.senses[0] && <p className="mt-1 text-sm text-[var(--foreground)]">{entry.content.senses[0].meaningKo}</p>}
          {entry.content.examples[0] && (
            <p className="mt-2 text-sm text-[var(--foreground)]">
              {entry.content.examples[0].textEn}
              {entry.content.examples[0].textKo && <span className="block text-[var(--secondary)]">{entry.content.examples[0].textKo}</span>}
            </p>
          )}
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
