"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import {
  nextBox,
  nextReviewAt,
  MAX_BOX,
  meaningText,
  type Word,
  type TestMode,
  type DefMode,
} from "@/lib/vocab";

type Prog = { box: number; next_review_at: string; correct_streak: number; wrong_count: number };
type Settings = { test_mode: TestMode; def_mode: DefMode };

const SESSION_SIZE = 15;
const DEFAULT_SETTINGS: Settings = { test_mode: "mcq", def_mode: "ko" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function VocabPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [progress, setProgress] = useState<Record<string, Prog>>({});
  const [settings, setSettings] = useState<Record<string, Settings>>({});

  // 학습 세션
  const [activeDeck, setActiveDeck] = useState<string | null>(null);
  const [queue, setQueue] = useState<Word[]>([]);
  const [pos, setPos] = useState(0);
  const [qType, setQType] = useState<"mcq" | "typing">("mcq");
  const [choices, setChoices] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string | null>(null); // 답했는지(잠금) + 낸 답
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const [{ data: ws }, { data: pr }, { data: dk }] = await Promise.all([
        supabase.from("words").select("*").order("created_at"),
        supabase
          .from("word_progress")
          .select("word_id, box, next_review_at, correct_streak, wrong_count")
          .eq("user_id", auth.user.id),
        supabase.from("word_decks").select("deck, test_mode, def_mode"),
      ]);

      setWords((ws ?? []) as Word[]);

      const pmap: Record<string, Prog> = {};
      (pr ?? []).forEach((p: { word_id: string } & Prog) => {
        pmap[p.word_id] = { box: p.box, next_review_at: p.next_review_at, correct_streak: p.correct_streak, wrong_count: p.wrong_count };
      });
      setProgress(pmap);

      const smap: Record<string, Settings> = {};
      (dk ?? []).forEach((s: { deck: string } & Settings) => {
        smap[s.deck] = { test_mode: s.test_mode, def_mode: s.def_mode };
      });
      setSettings(smap);
      setLoading(false);
    }
    load();
  }, [router]);

  function settingsFor(deck: string): Settings {
    return settings[deck] ?? DEFAULT_SETTINGS;
  }

  const decks = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { deck: string; total: number; due: number; mastered: number }>();
    words.forEach((w) => {
      const cur = map.get(w.deck) ?? { deck: w.deck, total: 0, due: 0, mastered: 0 };
      cur.total += 1;
      const p = progress[w.id];
      if (!p) cur.due += 1;
      else if (new Date(p.next_review_at).getTime() <= now) cur.due += 1;
      if (p && p.box >= MAX_BOX) cur.mastered += 1;
      map.set(w.deck, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.deck.localeCompare(b.deck));
  }, [words, progress]);

  function buildQuestion(word: Word, deckWords: Word[], s: Settings) {
    const qt = s.test_mode === "both" ? (Math.random() < 0.5 ? "typing" : "mcq") : s.test_mode;
    setQType(qt);
    setTyped("");
    setPicked(null);
    setWasCorrect(null);
    if (qt === "mcq") {
      const correct = meaningText(word, s.def_mode);
      const distractors = Array.from(
        new Set(
          shuffle(deckWords.filter((w) => w.id !== word.id))
            .map((w) => meaningText(w, s.def_mode))
            .filter((m) => m && m !== correct)
        )
      ).slice(0, 3);
      setChoices(shuffle([correct, ...distractors]));
    } else {
      setChoices([]);
    }
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
    buildQuestion(q[0], deckWords, settingsFor(deck));
  }

  async function grade(correct: boolean, given: string) {
    if (picked || !userId) return;
    const word = queue[pos];
    setPicked(given);
    setWasCorrect(correct);
    setStats((st) => ({ correct: st.correct + (correct ? 1 : 0), total: st.total + 1 }));

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

    if (!correct) setQueue((q) => [...q, word]); // 틀리면 세션 끝에 다시
  }

  function next() {
    if (!activeDeck) return;
    const deckWords = words.filter((w) => w.deck === activeDeck);
    const np = pos + 1;
    if (np >= queue.length) { setPos(np); return; }
    setPos(np);
    buildQuestion(queue[np], deckWords, settingsFor(activeDeck));
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

  // ===== 학습 세션 =====
  if (activeDeck) {
    const finished = pos >= queue.length;
    const word = queue[pos];
    const s = settingsFor(activeDeck);
    const correctMeaning = word ? meaningText(word, s.def_mode) : "";
    return (
      <>
        <Header />
        <main className="mx-auto max-w-2xl px-6 py-16">
          <button onClick={endSession} className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 단어장 목록</button>

          {finished ? (
            <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center">
              <h1 className="text-2xl font-medium text-[var(--foreground)]">학습 완료 🎉</h1>
              <p className="mt-3 text-[var(--foreground)]">이번 세션 <span className="font-bold text-[var(--mint-dark)]">{stats.correct} / {stats.total} 정답</span></p>
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

              {qType === "mcq" ? (
                <>
                  <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
                    <p className="text-xs text-[var(--secondary)]">다음 단어의 뜻은?</p>
                    <p className="mt-2 text-4xl font-semibold text-[var(--foreground)]">{word.word}</p>
                    {word.part_of_speech && <p className="mt-1 text-sm text-[var(--secondary)]">{word.part_of_speech}</p>}
                  </div>
                  <div className="mt-4 space-y-2">
                    {choices.map((c) => {
                      const isAnswer = c === correctMeaning;
                      const isPicked = picked === c;
                      let cls = "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/20";
                      if (picked) {
                        if (isAnswer) cls = "border-[var(--mint-dark)] bg-[var(--mint)]/40";
                        else if (isPicked) cls = "border-red-400 bg-red-50";
                        else cls = "border-[var(--border-c)] bg-white opacity-60";
                      }
                      return (
                        <button key={c} onClick={() => grade(c === correctMeaning, c)} disabled={!!picked}
                          className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${cls}`}>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
                    <p className="text-xs text-[var(--secondary)]">뜻을 보고 영어 단어를 입력하세요</p>
                    <p className="mt-2 text-2xl font-medium text-[var(--foreground)]">{correctMeaning}</p>
                    {word.part_of_speech && <p className="mt-1 text-sm text-[var(--secondary)]">{word.part_of_speech}</p>}
                  </div>
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (!picked) grade(norm(typed) === norm(word.word), typed || "(무응답)"); }}
                  >
                    <input
                      type="text"
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      disabled={!!picked}
                      autoFocus
                      placeholder="영어 단어 입력"
                      className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--pink)]"
                    />
                    {!picked && (
                      <button type="submit" className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">확인</button>
                    )}
                  </form>
                </>
              )}

              {picked && (
                <div className="mt-4 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-4">
                  <p className="text-sm text-[var(--foreground)]">
                    {wasCorrect ? "✅ 맞았어요" : "❌ 틀렸어요"} · <b>{word.word}</b>
                    {word.part_of_speech && <span className="text-[var(--secondary)]"> ({word.part_of_speech})</span>}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground)]">{word.meaning}</p>
                  {word.definition_en && <p className="text-sm text-[var(--secondary)]">{word.definition_en}</p>}
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

  // ===== 단어장 목록 =====
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
                      className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50">복습 시작</button>
                    <button onClick={() => startDeck(d.deck, false)}
                      className="rounded-full border border-[var(--border-c)] bg-white px-4 py-2 text-sm text-[var(--foreground)]">전체 학습</button>
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
