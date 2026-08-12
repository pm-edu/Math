"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody } from "@/components/ProblemBody";
import { canManageMaterials } from "@/lib/roles";
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
  const [picked, setPicked] = useState<string[]>([]); // problem ids (선택 순서 유지)
  const [filterCat, setFilterCat] = useState("");
  const [filterUnit, setFilterUnit] = useState("");

  // 문제지별 "선별 배포"용 선택 학생 목록
  const [pickedStudents, setPickedStudents] = useState<Record<string, string[]>>({});

  // 출제 전 미리보기
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewProblems, setPreviewProblems] = useState<Problem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

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
      if (!canManageMaterials(me?.role)) { setAllowed(false); return; }
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

    // 선택한 순서(picked 배열 순서)대로 position 1,2,3... 을 매긴다.
    const rows = picked.map((pid, i) => ({ worksheet_id: ws.id, problem_id: pid, position: i + 1 }));
    const { error: linkErr } = await supabase.from("worksheet_problems").insert(rows);
    setSaving(false);
    if (linkErr) { setError(`문제 추가 실패: ${linkErr.message}`); return; }

    setTitle(""); setPicked([]);
    setMessage(`"${title}" 문제지를 만들었습니다. 아래에서 미리보기로 확인한 뒤 학생에게 배포하세요.`);
    loadWorksheets();
  }

  // 학생 선별 배포: 문제지별로 학생을 여러 명 골라둔다
  function toggleStudent(worksheetId: string, studentId: string) {
    setPickedStudents((prev) => {
      const cur = prev[worksheetId] ?? [];
      const next = cur.includes(studentId) ? cur.filter((x) => x !== studentId) : [...cur, studentId];
      return { ...prev, [worksheetId]: next };
    });
  }

  async function assignSelected(worksheetId: string) {
    const ids = pickedStudents[worksheetId] ?? [];
    if (ids.length === 0) { setError("배포할 학생을 한 명 이상 선택하세요."); return; }
    setError(null); setMessage(null);
    const rows = ids.map((uid) => ({ worksheet_id: worksheetId, user_id: uid }));
    const { error } = await createClient()
      .from("worksheet_assignments")
      .upsert(rows, { onConflict: "worksheet_id,user_id" });
    if (error) { setError(`배포 실패: ${error.message}`); return; }
    setMessage(`선택한 ${ids.length}명에게 배포했습니다.`);
    setPickedStudents((prev) => ({ ...prev, [worksheetId]: [] }));
  }

  async function assignAll(worksheetId: string) {
    if (!confirm(`전체 학생 ${students.length}명에게 배포할까요?`)) return;
    setError(null); setMessage(null);
    const rows = students.map((s) => ({ worksheet_id: worksheetId, user_id: s.id }));
    const { error } = await createClient().from("worksheet_assignments").upsert(rows, { onConflict: "worksheet_id,user_id" });
    if (error) { setError(`배포 실패: ${error.message}`); return; }
    setMessage(`전체 ${students.length}명에게 배포했습니다.`);
  }

  // 출제 전 미리보기: 문제지에 담긴 문제를 순서대로 불러와 학생 화면처럼 보여준다
  async function togglePreview(worksheetId: string) {
    if (previewId === worksheetId) { setPreviewId(null); setPreviewProblems([]); return; }
    setPreviewId(worksheetId);
    setPreviewLoading(true);
    setPreviewProblems([]);
    const { data } = await createClient()
      .from("worksheet_problems")
      .select("position, problem:problems(*)")
      .eq("worksheet_id", worksheetId)
      .order("position");
    const list = (data ?? []).flatMap((r) => {
      const p = (r as { problem: Problem | Problem[] | null }).problem;
      return Array.isArray(p) ? p : p ? [p] : [];
    });
    setPreviewProblems(list);
    setPreviewLoading(false);
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

          <p className="mt-2 text-xs text-[var(--secondary)]">
            문제를 클릭한 순서대로 번호가 매겨집니다. 순서를 바꾸려면 선택을 해제했다가 원하는 순서로 다시 클릭하세요.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm">
              <option value="">전체 분류</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} placeholder="단원 검색" className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {problems.map((p) => {
              const order = picked.indexOf(p.id);
              const on = order !== -1;
              return (
                <button type="button" key={p.id} onClick={() => togglePick(p.id)}
                  className={`relative rounded-xl border-2 p-2 text-left transition-colors ${on ? "border-[var(--pink)] bg-[var(--pink-light)]/40" : "border-[var(--border-c)] bg-white"}`}>
                  {on && (
                    <span className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--pink)] text-xs font-bold text-[var(--pink-dark)] shadow">
                      {order + 1}
                    </span>
                  )}
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

        {/* 2) 만든 문제지 미리보기 · 배포 */}
        <h2 className="mt-12 text-lg font-medium text-[var(--foreground)]">문제지 목록 · 미리보기 · 배포</h2>
        <ul className="mt-4 space-y-3">
          {worksheets.map((w) => {
            const selCount = (pickedStudents[w.id] ?? []).length;
            return (
              <li key={w.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{w.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => togglePreview(w.id)}
                      className="rounded-full border border-[var(--border-c)] px-4 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/40">
                      {previewId === w.id ? "미리보기 닫기" : "미리보기(출제 전 확인)"}
                    </button>
                    <button onClick={() => assignSelected(w.id)}
                      className="rounded-full bg-[var(--mint)] px-4 py-1.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-50"
                      disabled={selCount === 0}>
                      선택 {selCount > 0 ? `${selCount}명 ` : ""}배포
                    </button>
                    <button onClick={() => assignAll(w.id)} className="rounded-full bg-[var(--pink)] px-4 py-1.5 text-sm font-medium text-[var(--pink-dark)]">
                      전체 학생에게 배포
                    </button>
                  </div>
                </div>

                {/* 학생 선별: 이름을 눌러 여러 명 고른 뒤 "선택 배포" */}
                {students.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs text-[var(--secondary)]">배포할 학생 선택 (여러 명 가능)</p>
                    <div className="flex flex-wrap gap-2">
                      {students.map((s) => {
                        const on = (pickedStudents[w.id] ?? []).includes(s.id);
                        return (
                          <button key={s.id} onClick={() => toggleStudent(w.id, s.id)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              on
                                ? "border-[var(--mint-dark)] bg-[var(--mint)] text-[var(--mint-dark)] font-medium"
                                : "border-[var(--border-c)] text-[var(--secondary)] hover:bg-[var(--mint)]/40"
                            }`}>
                            {on ? "✓ " : ""}{s.name ?? s.email}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 출제 전 미리보기: 학생이 보게 될 화면(번호·수식·정답) */}
                {previewId === w.id && (
                  <div className="mt-4 rounded-xl border border-[var(--border-c)] bg-[var(--background)] p-5">
                    {previewLoading ? (
                      <p className="text-sm text-[var(--secondary)]">불러오는 중...</p>
                    ) : previewProblems.length === 0 ? (
                      <p className="text-sm text-[var(--secondary)]">담긴 문제가 없습니다.</p>
                    ) : (
                      <ol className="space-y-6">
                        {previewProblems.map((p, i) => (
                          <li key={p.id}>
                            <p className="mb-2 text-sm font-medium text-[var(--secondary)]">{i + 1}번</p>
                            <ProblemBody
                              problem={p}
                              imgClassName="w-full rounded-xl border border-[var(--border-c)]"
                              textClassName="rounded-xl border border-[var(--border-c)] bg-white p-5 text-[15px] leading-relaxed text-[var(--foreground)]"
                            />
                            {p.answer && (
                              <p className="mt-2 rounded-lg bg-[var(--mint)]/40 px-4 py-2 text-sm text-[var(--foreground)]">
                                정답: {p.answer}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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
