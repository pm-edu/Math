"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import { VOCAB_TAGS, type TestMode, type DefMode } from "@/lib/vocab";
import type { Profile } from "@/lib/profile";

type Draft = {
  word: string;
  meaning: string;
  definition_en: string;
  part_of_speech: string;
  example: string;
  example_ko: string;
  include: boolean;
};

type DeckInfo = { deck: string; tag: string; count: number; test_mode: TestMode; def_mode: DefMode };

const TEST_MODE_LABEL: Record<TestMode, string> = { mcq: "객관식", typing: "주관식", both: "섞어서" };
const DEF_MODE_LABEL: Record<DefMode, string> = { ko: "영한(한국어 뜻)", en: "영영(영어 정의)", both: "둘 다" };

export default function AdminWordsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // 생성 폼
  const [deck, setDeck] = useState("기본");
  const [tag, setTag] = useState("general");
  const [level, setLevel] = useState(2);
  const [count, setCount] = useState(10);
  const [topic, setTopic] = useState("");
  const [testMode, setTestMode] = useState<TestMode>("mcq");
  const [defMode, setDefMode] = useState<DefMode>("ko");

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 단어장 목록 + 배정
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [pickedStudents, setPickedStudents] = useState<Record<string, string[]>>({});

  const loadDecks = useCallback(async () => {
    const supabase = createClient();
    const [{ data: ws }, { data: settings }] = await Promise.all([
      supabase.from("words").select("deck, tag"),
      supabase.from("word_decks").select("deck, test_mode, def_mode"),
    ]);
    const setMap = new Map<string, { test_mode: TestMode; def_mode: DefMode }>();
    (settings ?? []).forEach((s: { deck: string; test_mode: TestMode; def_mode: DefMode }) =>
      setMap.set(s.deck, { test_mode: s.test_mode, def_mode: s.def_mode })
    );
    const map = new Map<string, DeckInfo>();
    (ws ?? []).forEach((w: { deck: string; tag: string }) => {
      const s = setMap.get(w.deck);
      const cur =
        map.get(w.deck) ??
        { deck: w.deck, tag: w.tag, count: 0, test_mode: s?.test_mode ?? "mcq", def_mode: s?.def_mode ?? "ko" };
      cur.count += 1;
      map.set(w.deck, cur);
    });
    setDecks(Array.from(map.values()).sort((a, b) => a.deck.localeCompare(b.deck)));
  }, []);

  async function updateDeckSettings(d: string, patch: Partial<Pick<DeckInfo, "test_mode" | "def_mode">>) {
    const cur = decks.find((x) => x.deck === d);
    if (!cur) return;
    const next = { test_mode: patch.test_mode ?? cur.test_mode, def_mode: patch.def_mode ?? cur.def_mode };
    setDecks((prev) => prev.map((x) => (x.deck === d ? { ...x, ...next } : x)));
    await createClient()
      .from("word_decks")
      .upsert({ deck: d, tag: cur.tag, ...next }, { onConflict: "deck" });
  }

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) { setAllowed(false); return; }
      setAllowed(true);
      const { data: studs } = await supabase.from("profiles").select("*").eq("role", "student").order("created_at", { ascending: false });
      setStudents((studs ?? []) as Profile[]);
      loadDecks();
    }
    init();
  }, [router, loadDecks]);

  async function handleGenerate() {
    setError(null); setMessage(null);
    if (!deck.trim()) { setError("단어장 이름을 입력해주세요."); return; }
    setGenerating(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      // 같은 단어장에 이미 있는 단어는 제외하도록 넘긴다
      const { data: existing } = await supabase.from("words").select("word").eq("deck", deck.trim());
      const exclude = (existing ?? []).map((w: { word: string }) => w.word);

      const res = await fetch("/api/generate-words", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count, tag, level, topic, exclude }),
      });
      const data = await res.json();
      setGenerating(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "생성 실패"); return; }

      const list: Draft[] = (data.words ?? []).map((w: Record<string, unknown>) => ({
        word: String(w.word ?? ""),
        meaning: String(w.meaning ?? ""),
        definition_en: String(w.definition_en ?? ""),
        part_of_speech: String(w.part_of_speech ?? ""),
        example: String(w.example ?? ""),
        example_ko: String(w.example_ko ?? ""),
        include: true,
      }));
      setDrafts(list);
      setMessage(list.length > 0 ? `${list.length}개 단어를 생성했습니다. 검토 후 저장하세요.` : "생성된 단어가 없습니다.");
    } catch {
      setGenerating(false);
      setError("생성 중 오류가 발생했습니다.");
    }
  }

  function update(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setError(null); setMessage(null);
    const chosen = drafts.filter((d) => d.include && d.word.trim() && d.meaning.trim());
    if (chosen.length === 0) { setError("저장할 단어가 없습니다."); return; }
    setSaving(true);
    const rows = chosen.map((d) => ({
      deck: deck.trim(),
      tag,
      word: d.word.trim(),
      meaning: d.meaning.trim(),
      definition_en: d.definition_en.trim() || null,
      part_of_speech: d.part_of_speech.trim() || null,
      example: d.example.trim() || null,
      example_ko: d.example_ko.trim() || null,
      level,
      source: "ai",
      verified: true, // 관리자가 검토하고 저장 = 검수 완료
    }));
    const supabase = createClient();
    const { error: insErr } = await supabase.from("words").insert(rows);
    if (insErr) { setSaving(false); setError(`저장 실패: ${insErr.message}`); return; }
    // 단어장 설정(테스트 유형·뜻 표시)을 저장/갱신한다.
    await supabase
      .from("word_decks")
      .upsert({ deck: deck.trim(), tag, test_mode: testMode, def_mode: defMode }, { onConflict: "deck" });
    setSaving(false);
    setMessage(`${rows.length}개 단어를 "${deck.trim()}" 단어장에 저장했습니다.`);
    setDrafts([]);
    loadDecks();
  }

  function toggleStudent(d: string, studentId: string) {
    setPickedStudents((prev) => {
      const cur = prev[d] ?? [];
      const next = cur.includes(studentId) ? cur.filter((x) => x !== studentId) : [...cur, studentId];
      return { ...prev, [d]: next };
    });
  }

  async function assign(d: string, ids: string[]) {
    if (ids.length === 0) { setError("배정할 학생을 선택하세요."); return; }
    setError(null); setMessage(null);
    const rows = ids.map((uid) => ({ user_id: uid, deck: d }));
    const { error: e } = await createClient().from("word_assignments").upsert(rows, { onConflict: "user_id,deck" });
    if (e) { setError(`배정 실패: ${e.message}`); return; }
    setMessage(`"${d}" 단어장을 ${ids.length}명에게 배정했습니다.`);
    setPickedStudents((prev) => ({ ...prev, [d]: [] }));
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) return (
    <Shell>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
      <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
    </Shell>
  );

  const inputClass = "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">영어 단어 (완전학습)</h1>
        <p className="mt-2 text-[var(--secondary)]">AI로 단어를 만들어 검수·저장하고, 단어장을 학생에게 배정하세요. 학생은 자동채점 + 복습(틀린 단어 다시 나오기)으로 외웁니다.</p>

        {/* 생성 폼 */}
        <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">단어장 이름</label>
              <input type="text" value={deck} onChange={(e) => setDeck(e.target.value)} placeholder="예: SAT 기본 300" className={inputClass} />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">시험 종류</label>
              <select value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass}>
                {VOCAB_TAGS.map((tg) => <option key={tg} value={tg}>{tg === "general" ? "일반" : tg}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">개수</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                {[5, 10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}개</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도</label>
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={inputClass}>
                <option value={1}>쉬움</option>
                <option value={2}>보통</option>
                <option value={3}>어려움</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">주제 (선택)</label>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="science, business..." className={inputClass} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">테스트 유형</label>
              <select value={testMode} onChange={(e) => setTestMode(e.target.value as TestMode)} className={inputClass}>
                <option value="mcq">객관식 (뜻 고르기)</option>
                <option value="typing">주관식 (단어 입력)</option>
                <option value="both">섞어서</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">뜻 표시</label>
              <select value={defMode} onChange={(e) => setDefMode(e.target.value as DefMode)} className={inputClass}>
                <option value="ko">영한 (한국어 뜻)</option>
                <option value="en">영영 (영어 정의)</option>
                <option value="both">둘 다</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-[var(--secondary)]">테스트 유형·뜻 표시는 단어장 설정으로 저장됩니다. 아래 단어장 목록에서 언제든 바꿀 수 있어요.</p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button onClick={handleGenerate} disabled={generating} className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
            {generating ? "생성 중... (수십 초)" : "AI로 단어 생성"}
          </button>
        </div>

        {/* 검토 · 저장 */}
        {drafts.length > 0 && (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[var(--foreground)]">생성된 단어 {drafts.length}개 (검토 후 저장)</h2>
              <button onClick={handleSave} disabled={saving} className="rounded-full bg-[var(--mint)] px-6 py-2.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60">
                {saving ? "저장 중..." : `"${deck}"에 저장`}
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {drafts.map((d, i) => (
                <li key={i} className={`rounded-2xl border bg-white p-4 ${d.include ? "border-[var(--border-c)]" : "border-[var(--border-c)] opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--secondary)]">{i + 1}</span>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                      <input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} /> 저장 포함
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input value={d.word} onChange={(e) => update(i, { word: e.target.value })} placeholder="단어" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                    <input value={d.meaning} onChange={(e) => update(i, { meaning: e.target.value })} placeholder="뜻" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                    <input value={d.definition_en} onChange={(e) => update(i, { definition_en: e.target.value })} placeholder="영영 정의 (English definition)" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)] sm:col-span-2" />
                    <input value={d.part_of_speech} onChange={(e) => update(i, { part_of_speech: e.target.value })} placeholder="품사" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                    <input value={d.example} onChange={(e) => update(i, { example: e.target.value })} placeholder="예문" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                    <input value={d.example_ko} onChange={(e) => update(i, { example_ko: e.target.value })} placeholder="예문 뜻" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)] sm:col-span-2" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* 단어장 목록 · 배정 */}
        <h2 className="mt-14 text-lg font-medium text-[var(--foreground)]">단어장 · 배정</h2>
        <ul className="mt-4 space-y-3">
          {decks.map((dk) => {
            const sel = pickedStudents[dk.deck] ?? [];
            return (
              <li key={dk.deck} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {dk.deck} <span className="text-[var(--secondary)]">· {dk.tag === "general" ? "일반" : dk.tag} · {dk.count}단어</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[var(--secondary)]">테스트</span>
                      <select value={dk.test_mode} onChange={(e) => updateDeckSettings(dk.deck, { test_mode: e.target.value as TestMode })}
                        className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1">
                        {(["mcq", "typing", "both"] as TestMode[]).map((m) => <option key={m} value={m}>{TEST_MODE_LABEL[m]}</option>)}
                      </select>
                      <span className="ml-1 text-[var(--secondary)]">뜻</span>
                      <select value={dk.def_mode} onChange={(e) => updateDeckSettings(dk.deck, { def_mode: e.target.value as DefMode })}
                        className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1">
                        {(["ko", "en", "both"] as DefMode[]).map((m) => <option key={m} value={m}>{DEF_MODE_LABEL[m]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => assign(dk.deck, sel)} disabled={sel.length === 0} className="rounded-full bg-[var(--mint)] px-4 py-1.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-50">
                      선택 {sel.length > 0 ? `${sel.length}명 ` : ""}배정
                    </button>
                    <button onClick={() => assign(dk.deck, students.map((s) => s.id))} className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-sm font-medium text-[var(--pink-dark)]">전체 배정</button>
                  </div>
                </div>
                {students.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {students.map((s) => {
                      const on = sel.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => toggleStudent(dk.deck, s.id)} className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-[var(--mint-dark)] bg-[var(--mint)] font-medium text-[var(--mint-dark)]" : "border-[var(--border-c)] text-[var(--secondary)] hover:bg-[var(--mint)]/40"}`}>
                          {on ? "✓ " : ""}{s.name ?? s.email}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
          {decks.length === 0 && (
            <li className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">아직 만든 단어장이 없습니다. 위에서 생성해보세요.</li>
          )}
        </ul>
      </main>
      <Footer />
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">{children}</main>
      <Footer />
    </>
  );
}
