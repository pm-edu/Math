"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody } from "@/components/ProblemBody";
import { CATEGORIES, type Problem, type Worksheet } from "@/lib/problems";
import type { Profile } from "@/lib/profile";

export default function AdminWorksheetsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [problems, setProblems] = useState<Problem[]>([]);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);

  // 새 문제지 구성
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]); // problem ids
  const [filterCat, setFilterCat] = useState("");
  const [filterUnit, setFilterUnit] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProblems = useCallback(async () => {
    let q = createClient().from("problems").select("*").order("created_at", { ascending: false });
    if (filterCat) q = q.eq("category", filterCat);
    if (filterUnit) q = q.ilike("unit", `%${filterUnit}%`);
    const { data } = await q;
    setProblems((data ?? []) as Problem[]);
  }, [filterCat, filterUnit]);

  const loadWorksheets = useCallback(async () => {
    const { data } = await createClient().from("worksheets").select("*").order("created_at", { ascending: false });
    setWorksheets((data ?? []) as Worksheet[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (me?.role !== "admin") { setAllowed(false); return; }
      setAllowed(true);
      const { data: studs } = await supabase.from("profiles").select("*").eq("role", "student").order("created_at", { ascending: false });
      setStudents((studs ?? []) as Profile[]);
    }
    init();
  }, [router]);

  useEffect(() => {
    if (allowed) { loadProblems(); loadWorksheets(); }
  }, [allowed, loadProblems, loadWorksheets]);

  function togglePick(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!title.trim()) { setError("문제지 제목을 입력해주세요."); return; }
    if (picked.length === 0) { setError("문제를 하나 이상 선택해주세요."); return; }

    setSaving(true);
    const supabase = createClient();
    const { data: ws, error: wErr } = await supabase.from("worksheets").insert({ title: title.trim() }).select("id").single();
    if (wErr || !ws) { setSaving(false); setError(`생성 실패: ${wErr?.message}`); return; }

    const rows = picked.map((pid, i) => ({ worksheet_id: ws.id, problem_id: pid, position: i + 1 }));
    const { error: linkErr } = await supabase.from("worksheet_problems").insert(rows);
    setSaving(false);
    if (linkErr) { setError(`문제 추가 실패: ${linkErr.message}`); return; }

    setTitle(""); setPicked([]);
    setMessage(`"${ws && title}" 문제지를 만들었습니다. 아래에서 학생에게 배포하세요.`);
    loadWorksheets();
  }

  async function assign(worksheetId: string, userId: string) {
    const { error } = await createClient().from("worksheet_assignments").insert({ worksheet_id: worksheetId, user_id: userId });
    if (error && error.code !== "23505") { setError(`배포 실패: ${error.message}`); return; }
    setMessage("배포했습니다.");
  }

  async function assignAll(worksheetId: string) {
    if (!confirm(`전체 학생 ${students.length}명에게 배포할까요?`)) return;
    const rows = students.map((s) => ({ worksheet_id: worksheetId, user_id: s.id }));
    const { error } = await createClient().from("worksheet_assignments").upsert(rows, { onConflict: "worksheet_id,user_id" });
    if (error) { setError(`배포 실패: ${error.message}`); return; }
    setMessage(`전체 ${students.length}명에게 배포했습니다.`);
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) return (
    <Shell>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
      <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
    </Shell>
  );

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">문제지 만들기 · 배포</h1>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-4 text-sm text-[var(--mint-dark)]">{message}</p>}

        {/* 1) 문제 골라 문제지 만들기 */}
        <form onSubmit={handleCreate} className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="문제지 제목 (예: 고1 이차방정식 20제)"
              className="flex-1 min-w-[200px] rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]" />
            <span className="text-sm text-[var(--secondary)]">선택 {picked.length}문제</span>
            <button type="submit" disabled={saving} className="rounded-full bg-[var(--pink)] px-6 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
              {saving ? "만드는 중..." : "문제지 만들기"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm">
              <option value="">전체 분류</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} placeholder="단원 검색" className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {problems.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button type="button" key={p.id} onClick={() => togglePick(p.id)}
                  className={`rounded-xl border-2 p-2 text-left transition-colors ${on ? "border-[var(--pink)] bg-[var(--pink-light)]/40" : "border-[var(--border-c)] bg-white"}`}>
                  <ProblemBody
                    problem={p}
                    imgClassName="w-full rounded-lg"
                    textClassName="rounded-lg bg-white p-2 text-xs leading-relaxed text-[var(--foreground)] max-h-40 overflow-hidden"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-[var(--secondary)]">
                    <span>{p.category}</span>
                    {p.course_level && <span>· {p.course_level}</span>}
                    {p.unit && <span>· {p.unit}</span>}
                    <span>· {p.difficulty}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {problems.length === 0 && (
            <p className="mt-4 text-sm text-[var(--secondary)]">
              등록된 문제가 없습니다. <Link href="/admin/problems" className="underline">문제은행</Link>에서 먼저 등록하세요.
            </p>
          )}
        </form>

        {/* 2) 만든 문제지 배포 */}
        <h2 className="mt-12 text-lg font-medium text-[var(--foreground)]">문제지 목록 · 배포</h2>
        <ul className="mt-4 space-y-3">
          {worksheets.map((w) => (
            <li key={w.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--foreground)]">{w.title}</p>
                <button onClick={() => assignAll(w.id)} className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-sm font-medium text-[var(--pink-dark)]">
                  전체 학생에게 배포
                </button>
              </div>
              {students.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {students.map((s) => (
                    <button key={s.id} onClick={() => assign(w.id, s.id)}
                      className="rounded-full border border-[var(--border-c)] px-3 py-1 text-xs text-[var(--secondary)] hover:bg-[var(--mint)]/40">
                      {s.name ?? s.email} +
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
          {worksheets.length === 0 && (
            <li className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
              아직 만든 문제지가 없습니다.
            </li>
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
