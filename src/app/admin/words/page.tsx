"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import {
  loadWordSets,
  createWordSet,
  togglePublish,
  loadUnits,
  createUnit,
  loadUnitWordsAdmin,
  saveGeneratedWords,
  type AdminWordSet,
  type AdminUnit,
  type AdminWordRow,
  type GeneratedWordDraft,
} from "@/lib/english/admin-data";

type Draft = GeneratedWordDraft & { include: boolean };

export default function AdminWordsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [sets, setSets] = useState<AdminWordSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [units, setUnits] = useState<AdminUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [unitWords, setUnitWords] = useState<AdminWordRow[]>([]);

  // 새 단어장·유닛 폼
  const [newSetTitle, setNewSetTitle] = useState("");
  const [newSetTitleEn, setNewSetTitleEn] = useState("");
  const [newSetCurriculum, setNewSetCurriculum] = useState("general");
  const [newSetLevel, setNewSetLevel] = useState("");
  const [newUnitTitle, setNewUnitTitle] = useState("");

  // AI 생성 폼
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState(2);
  const [topic, setTopic] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSets = useCallback(async () => {
    setSets(await loadWordSets());
  }, []);

  const refreshUnits = useCallback(async (setId: string) => {
    setUnits(await loadUnits(setId));
  }, []);

  const refreshUnitWords = useCallback(async (unitId: string) => {
    setUnitWords(await loadUnitWordsAdmin(unitId));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      const ok = canManageMaterials(me?.role);
      setAllowed(ok);
      if (ok) await refreshSets();
    }
    init();
  }, [router, refreshSets]);

  async function handleCreateSet(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!newSetTitle.trim()) { setError("단어장 이름을 입력해주세요."); return; }
    try {
      const id = await createWordSet({ titleKo: newSetTitle.trim(), titleEn: newSetTitleEn.trim(), curriculum: newSetCurriculum, level: newSetLevel.trim() });
      setNewSetTitle(""); setNewSetTitleEn(""); setNewSetLevel("");
      await refreshSets();
      setSelectedSetId(id);
      await refreshUnits(id);
      setMessage(`"${newSetTitle}" 단어장을 만들었습니다. 발행 전까지는 학생에게 안 보입니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "단어장을 만들지 못했습니다.");
    }
  }

  async function handleTogglePublish(s: AdminWordSet) {
    await togglePublish(s.id, !s.isPublished);
    await refreshSets();
  }

  async function selectSet(id: string) {
    setSelectedSetId(id);
    setSelectedUnitId(null);
    setUnitWords([]);
    setDrafts([]);
    await refreshUnits(id);
  }

  async function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!selectedSetId) return;
    if (!newUnitTitle.trim()) { setError("유닛 이름을 입력해주세요."); return; }
    try {
      const id = await createUnit(selectedSetId, newUnitTitle.trim());
      setNewUnitTitle("");
      await refreshUnits(selectedSetId);
      setSelectedUnitId(id);
      await refreshUnitWords(id);
      setMessage(`"${newUnitTitle}" 유닛을 만들었습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "유닛을 만들지 못했습니다.");
    }
  }

  async function selectUnit(id: string) {
    setSelectedUnitId(id);
    setDrafts([]);
    await refreshUnitWords(id);
  }

  async function handleGenerate() {
    if (!selectedSetId) return;
    setError(null); setMessage(null);
    setGenerating(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const currentSet = sets.find((s) => s.id === selectedSetId);
      const exclude = unitWords.map((w) => w.lemma);

      const res = await fetch("/api/generate-words", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count, level, topic, tag: currentSet?.curriculum ?? "general", exclude }),
      });
      const data = await res.json();
      setGenerating(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "생성 실패"); return; }

      const list: Draft[] = (data.words ?? []).map((w: Record<string, unknown>) => ({
        lemma: String(w.word ?? ""),
        pos: String(w.part_of_speech ?? ""),
        meaningKo: String(w.meaning ?? ""),
        meaningEn: String(w.definition_en ?? ""),
        exampleEn: String(w.example ?? ""),
        exampleKo: String(w.example_ko ?? ""),
        include: true,
      }));
      setDrafts(list);
      setMessage(list.length > 0 ? `${list.length}개 단어를 생성했습니다. 검토 후 저장하세요.` : "생성된 단어가 없습니다.");
    } catch {
      setGenerating(false);
      setError("생성 중 오류가 발생했습니다.");
    }
  }

  function updateDraft(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    if (!selectedUnitId) return;
    setError(null); setMessage(null);
    const chosen = drafts.filter((d) => d.include && d.lemma.trim() && d.meaningKo.trim());
    if (chosen.length === 0) { setError("저장할 단어가 없습니다."); return; }
    setSaving(true);
    try {
      const { saved, skipped } = await saveGeneratedWords(selectedUnitId, chosen);
      setSaving(false);
      setDrafts([]);
      await refreshUnitWords(selectedUnitId);
      await refreshSets();
      if (selectedSetId) await refreshUnits(selectedSetId);
      setMessage(
        `${saved}개 단어를 저장했습니다.` + (skipped.length > 0 ? ` (이미 있어서 건너뜀: ${skipped.join(", ")})` : "")
      );
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) return (
    <Shell>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
      <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
    </Shell>
  );

  const inputClass = "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";
  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">영어 단어장 빌더</h1>
        <p className="mt-2 text-[var(--secondary)]">단어장 → 유닛 → 단어 순서로 만듭니다. AI가 만든 단어는 검토·수정 후 저장해야 학생에게 노출됩니다.</p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-4 text-sm text-[var(--mint-dark)]">{message}</p>}

        {/* 1) 단어장 */}
        <section className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--foreground)]">1. 단어장</h2>
          <ul className="mt-3 space-y-2">
            {sets.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => selectSet(s.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm ${selectedSetId === s.id ? "border-[var(--pink)] bg-[var(--pink-light)]/30" : "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/10"}`}
                >
                  <span>
                    {s.titleKo} <span className="text-xs text-[var(--secondary)]">· {s.curriculum} · 유닛 {s.unitCount} · 단어 {s.wordCount}</span>
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); handleTogglePublish(s); }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.isPublished ? "bg-[var(--mint)] text-[var(--mint-dark)]" : "border border-[var(--border-c)] text-[var(--secondary)]"}`}
                  >
                    {s.isPublished ? "발행됨" : "비공개"}
                  </span>
                </button>
              </li>
            ))}
            {sets.length === 0 && <p className="text-sm text-[var(--secondary)]">아직 만든 단어장이 없습니다.</p>}
          </ul>

          <form onSubmit={handleCreateSet} className="mt-4 grid gap-3 border-t border-[var(--border-c)] pt-4 sm:grid-cols-2">
            <input type="text" value={newSetTitle} onChange={(e) => setNewSetTitle(e.target.value)} placeholder="단어장 이름 (예: 중2 내신 1학기)" className={inputClass} />
            <input type="text" value={newSetTitleEn} onChange={(e) => setNewSetTitleEn(e.target.value)} placeholder="영어 이름 (선택)" className={inputClass} />
            <select value={newSetCurriculum} onChange={(e) => setNewSetCurriculum(e.target.value)} className={inputClass}>
              <option value="general">일반</option>
              <option value="SAT">SAT</option>
              <option value="TOEFL">TOEFL</option>
              <option value="IELTS">IELTS</option>
            </select>
            <div className="flex gap-2">
              <input type="text" value={newSetLevel} onChange={(e) => setNewSetLevel(e.target.value)} placeholder="레벨 (예: A2~B1)" className={inputClass} />
              <button type="submit" className="mt-1.5 whitespace-nowrap rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]">단어장 만들기</button>
            </div>
          </form>
        </section>

        {/* 2) 유닛 */}
        {selectedSet && (
          <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
            <h2 className="text-lg font-medium text-[var(--foreground)]">2. 유닛 — {selectedSet.titleKo}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {units.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => selectUnit(u.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm ${selectedUnitId === u.id ? "border-[var(--pink)] bg-[var(--pink-light)]/40" : "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/10"}`}
                  >
                    {u.position}. {u.title} <span className="text-xs text-[var(--secondary)]">({u.wordCount})</span>
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={handleCreateUnit} className="mt-4 flex gap-2 border-t border-[var(--border-c)] pt-4">
              <input type="text" value={newUnitTitle} onChange={(e) => setNewUnitTitle(e.target.value)} placeholder="유닛 이름 (예: 1과 - 인사와 소개)" className={inputClass} />
              <button type="submit" className="mt-1.5 whitespace-nowrap rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]">유닛 추가</button>
            </form>
          </section>
        )}

        {/* 3) 단어: 기존 목록 + AI 생성 */}
        {selectedUnitId && (
          <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
            <h2 className="text-lg font-medium text-[var(--foreground)]">3. 단어</h2>

            {unitWords.length > 0 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {unitWords.map((w) => (
                  <div key={w.wordId} className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm">
                    <span className="font-medium text-[var(--foreground)]">{w.lemma}</span>
                    <span className="ml-2 text-[var(--secondary)]">{w.meaningKo}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-3 border-t border-[var(--border-c)] pt-4 sm:grid-cols-3">
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}개</option>)}
              </select>
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={inputClass}>
                <option value={1}>쉬움</option>
                <option value={2}>보통</option>
                <option value={3}>어려움</option>
              </select>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="주제(선택)" className={inputClass} />
            </div>
            <button onClick={handleGenerate} disabled={generating} className="mt-3 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
              {generating ? "생성 중..." : "AI로 단어 생성"}
            </button>

            {drafts.length > 0 && (
              <>
                <div className="mt-6 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--foreground)]">생성된 단어 {drafts.length}개 (검토 후 저장)</h3>
                  <button onClick={handleSave} disabled={saving} className="rounded-full bg-[var(--mint)] px-5 py-2 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60">
                    {saving ? "저장 중..." : "선택 단어 저장"}
                  </button>
                </div>
                <ul className="mt-3 space-y-3">
                  {drafts.map((d, i) => (
                    <li key={i} className={`rounded-xl border bg-white p-3 ${d.include ? "border-[var(--border-c)]" : "border-[var(--border-c)] opacity-50"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--secondary)]">{i + 1}</span>
                        <label className="flex items-center gap-1.5 text-xs text-[var(--secondary)]">
                          <input type="checkbox" checked={d.include} onChange={(e) => updateDraft(i, { include: e.target.checked })} /> 저장 포함
                        </label>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input value={d.lemma} onChange={(e) => updateDraft(i, { lemma: e.target.value })} placeholder="단어" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                        <input value={d.pos} onChange={(e) => updateDraft(i, { pos: e.target.value })} placeholder="품사" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                        <input value={d.meaningKo} onChange={(e) => updateDraft(i, { meaningKo: e.target.value })} placeholder="뜻(한국어)" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                        <input value={d.meaningEn} onChange={(e) => updateDraft(i, { meaningEn: e.target.value })} placeholder="영영 정의" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]" />
                        <input value={d.exampleEn} onChange={(e) => updateDraft(i, { exampleEn: e.target.value })} placeholder="예문(영어)" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)] sm:col-span-2" />
                        <input value={d.exampleKo} onChange={(e) => updateDraft(i, { exampleKo: e.target.value })} placeholder="예문 뜻" className="rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)] sm:col-span-2" />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
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
