"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { nextBox, nextReviewAt, MAX_BOX, type Word } from "@/lib/vocab";

type Prog = { box: number; next_review_at: string; correct_streak: number; wrong_count: number };

const SESSION_SIZE = 15;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function VocabPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [progress, setProgress] = useState<Record<string, Prog>>({});

  // 학습 세션
  const [activeDeck, setActiveDeck] = useState<string | null>(null);
  const [queue, setQueue] = useState<Word[]>([]);
  const [pos, setPos] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const { data: ws } = await supabase.from("words").select("*").order("created_at");
      const list = (ws ?? []) as Word[];
      setWords(list);

      const { data: pr } = await supabase
        .from("word_progress")
        .select("word_id, box, next_review_at, correct_streak, wrong_count")
        .eq("user_id", auth.user.id);
      const pmap: Record<string, Prog> = {};
      (pr ?? []).forEach((p: { word_id: string } & Prog) => {
        pmap[p.word_id] = { box: p.box, next_review_at: p.next_review_at, correct_streak: p.correct_streak, wrong_count: p.wrong_count };
      });
      setProgress(pmap);
      setLoading(false);
    }
    load();
  }, [router]);

  // 단어장별 집계 (전체 / 복습 필요 / 마스터)
  const decks = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { deck: string; total: number; due: number; mastered: number }>();
    words.forEach((w) => {
      const cur = map.get(w.deck) ?? { deck: w.deck, total: 0, due: 0, mastered: 0 };
      cur.total += 1;
      const p = progress[w.id];
      if (!p) cur.due += 1; // 새 단어
      else if (new Date(p.next_review_at).getTime() <= now) cur.due += 1;
      if (p && p.box >= MAX_BOX) cur.mastered += 1;
      map.set(w.deck, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.deck.localeCompare(b.deck));
  }, [words, progress]);

  function buildQuestion(word: Word, deckWords: Word[]) {
    const distractors = shuffle(deckWords.filter((w) => w.id !== word.id && w.meaning !== word.meaning))
      .slice(0, 3)
      .map((w) => w.meaning);
    setChoices(shuffle([word.meaning, ...distractors]));
    setPicked(null);
  }

  function startDeck(deck: string, onlyDue: boolean) {
    const now = Date.now();
    const deckWords = words.filter((w) => w.deck === deck);
    let pool = deckWords;
    if (onlyDue) {
      pool = deckWords.filter((w) => {
        const p = progress[w.id];
        return !p || new Date(p.next_review_at).getTime() <= now;
      });
    }
    if (pool.length === 0) return;
    const q = shuffle(pool).slice(0, SESSION_SIZE);
    setActiveDeck(deck);
    setQueue(q);
    setPos(0);
    setStats({ correct: 0, total: 0 });
    buildQuestion(q[0], deckWords);
  }

  async function answer(choice: string) {
    if (picked || !userId) return;
    const word = queue[pos];
    const correct = choice === word.meaning;
    setPicked(choice);
    setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));

    const prev = progress[word.id];
    const box = prev?.box ?? 1;
    const newBox = nextBox(box, correct);
    const row = {
      user_id: userId,
      word_id: word.id,
      box: newBox,
      correct_streak: correct ? (prev?.correct_streak ?? 0) + 1 : 0,
      wrong_count: (prev?.wrong_count ?? 0) + (correct ? 0 : 1),
      next_review_at: nextReviewAt(newBox),
      last_reviewed_at: new Date().toISOString(),
    };
    setProgress((p) => ({ ...p, [word.id]: { box: row.box, next_review_at: row.next_review_at, correct_streak: row.correct_streak, wrong_count: row.wrong_count } }));
    await createClient().from("word_progress").upsert(row, { onConflict: "user_id,word_id" });

    // 틀리면 이번 세션 끝에 다시 넣어 한 번 더 나오게 한다.
    if (!correct) setQueue((q) => [...q, word]);
  }

  function next() {
    const deckWords = words.filter((w) => w.deck === activeDeck);
    const np = pos + 1;
    if (np >= queue.length) { setPos(np); return; } // 종료 화면
    setPos(np);
    buildQuestion(queue[np], deckWords);
  }

  function endSession() {
    setActiveDeck(null);
    setQueue([]);
    setPos(0);
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-2xl px-6 py-16"><p className="text-sm text-[var(--secondary)]">불러오는 중...</p></main>
        <Footer />
      </>
    );
  }

  // ===== 학습 세션 화면 =====
  if (activeDeck) {
    const finished = pos >= queue.length;
    const word = queue[pos];
    return (
      <>
        <Header />
        <main className="mx-auto max-w-2xl px-6 py-16">
          <button onClick={endSession} className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 단어장 목록</button>

          {finished ? (
            <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center">
              <h1 className="text-2xl font-medium text-[var(--foreground)]">학습 완료 🎉</h1>
              <p className="mt-3 text-[var(--foreground)]">
                이번 세션 <span className="font-bold text-[var(--mint-dark)]">{stats.correct} / {stats.total} 정답</span>
              </p>
              <p className="mt-2 text-sm text-[var(--secondary)]">틀린 단어는 곧 다시 나옵니다. 꾸준히 반복하면 완전히 외워집니다.</p>
              <div className="mt-6 flex justify-center gap-2">
                <button onClick={() => startDeck(activeDeck, true)} className="rounded-full bg-[var(--pink)] px-6 py-2.5 text-sm font-medium text-[var(--pink-dark)]">한 번 더</button>
                <button onClick={endSession} className="rounded-full border border-[var(--border-c)] bg-white px-6 py-2.5 text-sm text-[var(--foreground)]">목록으로</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-center justify-between text-sm text-[var(--secondary)]">
                <span>{activeDeck}</span>
                <span>{pos + 1} / {queue.length}</span>
              </div>

              <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
                <p className="text-xs text-[var(--secondary)]">다음 단어의 뜻은?</p>
                <p className="mt-2 text-4xl font-semibold text-[var(--foreground)]">{word.word}</p>
                {word.part_of_speech && <p className="mt-1 text-sm text-[var(--secondary)]">{word.part_of_speech}</p>}
              </div>

              <div className="mt-4 space-y-2">
                {choices.map((c) => {
                  const isAnswer = c === word.meaning;
                  const isPicked = picked === c;
                  let cls = "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/20";
                  if (picked) {
                    if (isAnswer) cls = "border-[var(--mint-dark)] bg-[var(--mint)]/40";
                    else if (isPicked) cls = "border-red-400 bg-red-50";
                    else cls = "border-[var(--border-c)] bg-white opacity-60";
                  }
                  return (
                    <button key={c} onClick={() => answer(c)} disabled={!!picked}
                      className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${cls}`}>
                      {c}
                    </button>
                  );
                })}
              </div>

              {picked && (
                <div className="mt-4 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-4">
                  <p className="text-sm text-[var(--foreground)]">
                    {picked === word.meaning ? "✅ 맞았어요" : "❌ 틀렸어요"} · <b>{word.word}</b> : {word.meaning}
                  </p>
                  {word.example && (
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                      {word.example}
                      {word.example_ko && <span className="block text-[var(--secondary)]">{word.example_ko}</span>}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button onClick={next} className="rounded-full bg-[var(--pink)] px-6 py-2 text-sm font-medium text-[var(--pink-dark)]">
                      {pos + 1 >= queue.length ? "결과 보기" : "다음"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        <Footer />
      </>
    );
  }

  // ===== 단어장 목록 화면 =====
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">단어 학습</h1>
        <p className="mt-2 text-[var(--secondary)]">배정받은 단어장을 복습하세요. 틀린 단어는 다시 나오고, 맞히면 점점 뜸하게 나옵니다.</p>

        {decks.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-12 text-center">
            <p className="text-[var(--foreground)]">아직 배정받은 단어장이 없습니다.</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">선생님이 단어장을 배정하면 여기에 나타납니다.</p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {decks.map((d) => (
              <li key={d.deck} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{d.deck}</p>
                    <p className="mt-0.5 text-xs text-[var(--secondary)]">
                      전체 {d.total} · <span className="text-[var(--pink-dark)]">복습 필요 {d.due}</span> · 완료 {d.mastered}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startDeck(d.deck, true)} disabled={d.due === 0}
                      className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50">
                      복습 시작
                    </button>
                    <button onClick={() => startDeck(d.deck, false)}
                      className="rounded-full border border-[var(--border-c)] bg-white px-4 py-2 text-sm text-[var(--foreground)]">
                      전체 학습
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
