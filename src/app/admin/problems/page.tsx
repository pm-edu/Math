"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, DIFFICULTIES, type Problem } from "@/lib/problems";

const EMPTY = {
  category: "고등" as string,
  unit: "",
  difficulty: "중" as string,
  answer: "",
  memo: "",
};

export default function AdminProblemsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 검색 필터
  const [filterCat, setFilterCat] = useState("");
  const [filterUnit, setFilterUnit] = useState("");

  const loadProblems = useCallback(async () => {
    let q = createClient().from("problems").select("*").order("created_at", { ascending: false });
    if (filterCat) q = q.eq("category", filterCat);
    if (filterUnit) q = q.ilike("unit", `%${filterUnit}%`);
    const { data } = await q;
    setProblems((data ?? []) as Problem[]);
  }, [filterCat, filterUnit]);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
    }
    init();
  }, [router]);

  useEffect(() => {
    if (allowed) loadProblems();
  }, [allowed, loadProblems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!file) {
      setError("문제 이미지를 선택해주세요.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // 1) 이미지 업로드
    const ext = file.name.split(".").pop() || "png";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("problems").upload(path, file);
    if (upErr) {
      setSaving(false);
      setError(`이미지 업로드 실패: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from("problems").getPublicUrl(path);

    // 2) 문제 등록
    const { error: insErr } = await supabase.from("problems").insert({
      category: form.category,
      unit: form.unit.trim() || null,
      difficulty: form.difficulty,
      answer: form.answer.trim() || null,
      memo: form.memo.trim() || null,
      image_url: pub.publicUrl,
      problem_type: "image",
    });
    setSaving(false);

    if (insErr) {
      setError(`등록 실패: ${insErr.message}`);
      return;
    }

    setForm(EMPTY);
    setFile(null);
    (document.getElementById("problem-file") as HTMLInputElement | null)?.value &&
      ((document.getElementById("problem-file") as HTMLInputElement).value = "");
    setMessage("문제를 등록했습니다.");
    loadProblems();
  }

  async function handleDelete(p: Problem) {
    if (!confirm("이 문제를 삭제할까요?")) return;
    const { error } = await createClient().from("problems").delete().eq("id", p.id);
    if (error) {
      setError(`삭제 실패: ${error.message}`);
      return;
    }
    setMessage("삭제했습니다.");
    loadProblems();
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">확인 중...</p>
        </main>
        <Footer />
      </>
    );
  }
  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
          ← 학생 관리로
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">문제은행</h1>
          <Link href="/admin/worksheets" className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]">
            문제지 만들기 →
          </Link>
        </div>

        {/* 등록 폼 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <p className="text-sm font-medium text-[var(--foreground)]">새 문제 등록</p>

          <div>
            <label className="text-sm text-[var(--foreground)]">문제 이미지</label>
            <input
              id="problem-file"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--secondary)]">PDF에서 문제를 캡처해 이미지로 올려주세요.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">분류</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도</label>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className={inputClass}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">정답 (선택)</label>
              <input type="text" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} placeholder="③ 또는 x=2" className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">단원 (선택)</label>
              <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="이차방정식" className={inputClass} />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">메모 (선택)</label>
              <input type="text" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="출처 등" className={inputClass} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button type="submit" disabled={saving} className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
            {saving ? "등록 중..." : "문제 등록"}
          </button>
        </form>

        {/* 검색 + 목록 */}
        <div className="mt-10 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium text-[var(--foreground)]">등록된 문제 {problems.length}개</h2>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="ml-auto rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm">
            <option value="">전체 분류</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} placeholder="단원 검색" className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt="문제" className="w-full rounded-lg border border-[var(--border-c)]" />
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full bg-[var(--mint)] px-2.5 py-0.5 font-medium text-[var(--mint-dark)]">{p.category}</span>
                {p.unit && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{p.unit}</span>}
                <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[var(--secondary)]">{p.difficulty}</span>
                {p.answer && <span className="text-[var(--secondary)]">정답 {p.answer}</span>}
              </div>
              <button onClick={() => handleDelete(p)} className="mt-2 text-xs text-red-600 underline">삭제</button>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
