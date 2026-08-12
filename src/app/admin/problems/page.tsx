"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody, MathText } from "@/components/ProblemBody";
import { canManageMaterials } from "@/lib/roles";
import { useSubject } from "@/lib/subject";
import { CATEGORIES, DIFFICULTIES, FORMATS, type Problem } from "@/lib/problems";

const EMPTY = {
  category: "고등" as string,
  courseLevel: "",
  unit: "",
  problemFormat: "" as string,
  difficulty: "중" as string,
  answers: "", // 콤마로 여러 정답: ③,①,④
  memo: "",
};

export default function AdminProblemsPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 검색 필터
  const [filterCat, setFilterCat] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [filterUnit, setFilterUnit] = useState("");

  // 풀이 검수 패널 (문제별)
  const [solveOpen, setSolveOpen] = useState<string | null>(null);
  const [solveDraft, setSolveDraft] = useState("");
  const [solveGenLoading, setSolveGenLoading] = useState(false);
  const [solveSaving, setSolveSaving] = useState(false);
  const [solveMsg, setSolveMsg] = useState<string | null>(null);

  const loadProblems = useCallback(async () => {
    let q = createClient()
      .from("problems")
      .select("*")
      .eq("subject", subject)
      .order("created_at", { ascending: false });
    if (filterCat) q = q.eq("category", filterCat);
    if (filterLevel) q = q.ilike("course_level", `%${filterLevel}%`);
    if (filterUnit) q = q.ilike("unit", `%${filterUnit}%`);
    const { data } = await q;
    setProblems((data ?? []) as Problem[]);
  }, [subject, filterCat, filterLevel, filterUnit]);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) { setAllowed(false); return; }
      setAllowed(true);
    }
    init();
  }, [router]);

  useEffect(() => { if (allowed) loadProblems(); }, [allowed, loadProblems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMessage(null);

    if (files.length === 0) { setError("문제 이미지를 하나 이상 선택해주세요."); return; }

    // 정답을 콤마로 나눠 이미지 순서와 매칭한다. 개수가 안 맞아도 있는 만큼만 붙인다.
    const answers = form.answers.split(",").map((s) => s.trim());

    setSaving(true);
    const supabase = createClient();
    let ok = 0;

    for (let i = 0; i < files.length; i++) {
      setProgress(`${i + 1} / ${files.length} 업로드 중...`);
      const file = files[i];
      const ext = file.name.split(".").pop() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from("problems").upload(path, file);
      if (upErr) { setError(`${i + 1}번째 이미지 업로드 실패: ${upErr.message}`); break; }

      const { data: pub } = supabase.storage.from("problems").getPublicUrl(path);
      const { error: insErr } = await supabase.from("problems").insert({
        subject,
        category: form.category,
        course_level: form.courseLevel.trim() || null,
        unit: form.unit.trim() || null,
        problem_format: form.problemFormat || null,
        difficulty: form.difficulty,
        answer: answers[i] || null,
        memo: form.memo.trim() || null,
        image_url: pub.publicUrl,
        problem_type: "image",
      });
      if (insErr) { setError(`${i + 1}번째 등록 실패: ${insErr.message}`); break; }
      ok++;
    }

    setSaving(false);
    setProgress("");
    if (ok > 0) {
      setForm(EMPTY);
      setFiles([]);
      const el = document.getElementById("problem-file") as HTMLInputElement | null;
      if (el) el.value = "";
      setMessage(`${ok}개 문제를 등록했습니다.`);
      loadProblems();
    }
  }

  async function handleDelete(p: Problem) {
    if (!confirm("이 문제를 삭제할까요?")) return;
    const { error } = await createClient().from("problems").delete().eq("id", p.id);
    if (error) { setError(`삭제 실패: ${error.message}`); return; }
    setMessage("삭제했습니다.");
    loadProblems();
  }

  // 풀이 검수 패널 열기/닫기
  function toggleSolve(p: Problem) {
    setSolveMsg(null);
    if (solveOpen === p.id) { setSolveOpen(null); return; }
    setSolveOpen(p.id);
    setSolveDraft(p.solution_text ?? ""); // 저장돼 있던 풀이를 편집칸에 채운다
  }

  // AI 풀이 "초안" 생성 → 편집칸에만 채운다 (아직 저장 아님)
  async function generateSolution(p: Problem) {
    setSolveMsg(null);
    setSolveGenLoading(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/generate-solution", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content_text: p.content_text,
          image_url: p.image_url,
          answer: p.answer,
          problem_format: p.problem_format,
        }),
      });
      const data = await res.json();
      setSolveGenLoading(false);
      if (!res.ok || !data.ok) { setSolveMsg(data.message ?? "생성 실패"); return; }
      setSolveDraft(data.solution);
      setSolveMsg("AI 초안을 만들었습니다. 반드시 검토·수정한 뒤 저장하세요.");
    } catch {
      setSolveGenLoading(false);
      setSolveMsg("생성 중 오류가 발생했습니다.");
    }
  }

  // 검수 승인 = 저장. 이때만 학생에게 보이는 solution_text 에 기록된다.
  async function saveSolution(p: Problem) {
    setSolveSaving(true);
    const { error } = await createClient()
      .from("problems")
      .update({ solution_text: solveDraft.trim() || null })
      .eq("id", p.id);
    setSolveSaving(false);
    if (error) { setSolveMsg(`저장 실패: ${error.message}`); return; }
    setSolveMsg("풀이를 저장했습니다.");
    setSolveOpen(null);
    loadProblems();
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) return (
    <Shell>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
      <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
    </Shell>
  );

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 학생 관리로</Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">문제은행</h1>
          <div className="flex gap-2">
            <Link href="/admin/extract" className="rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]">PDF에서 추출</Link>
            <Link href="/admin/sat" className="rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]">영어 SAT 생성</Link>
            <Link href="/admin/words" className="rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]">영어 단어</Link>
            <Link href="/admin/worksheets" className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]">문제지 만들기 →</Link>
          </div>
        </div>

        {/* 등록 폼 */}
        <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <p className="text-sm font-medium text-[var(--foreground)]">새 문제 등록 (여러 장 한 번에 가능)</p>

          <div>
            <label className="text-sm text-[var(--foreground)]">문제 이미지 (여러 개 선택 가능)</label>
            <input
              id="problem-file"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--secondary)]">
              PDF에서 문제 하나씩 캡처(Win+Shift+S)해 여러 장을 한 번에 올리세요. {files.length > 0 && `— ${files.length}장 선택됨`}
            </p>
          </div>

          <div>
            <label className="text-sm text-[var(--foreground)]">정답 (이미지 순서대로, 콤마로 구분)</label>
            <input
              type="text"
              value={form.answers}
              onChange={(e) => setForm({ ...form, answers: e.target.value })}
              placeholder="③,①,④,②,⑤"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--secondary)]">
              1번 이미지 → 첫 정답, 2번 이미지 → 두 번째 정답 순으로 붙습니다. 몰라도 비워두면 됩니다.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">학교급</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">과정</label>
              <input type="text" value={form.courseLevel} onChange={(e) => setForm({ ...form, courseLevel: e.target.value })} placeholder="고2 미적분 / 수능특강 / IB HL" className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">단원</label>
              <input type="text" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="이차방정식" className={inputClass} />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">유형</label>
              <select value={form.problemFormat} onChange={(e) => setForm({ ...form, problemFormat: e.target.value })} className={inputClass}>
                <option value="">(선택 안 함)</option>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도</label>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} className={inputClass}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <p className="text-xs text-[var(--secondary)]">
            분류·과정·단원·유형·난이도는 이번에 올리는 모든 이미지에 똑같이 적용됩니다. (같은 단원 문제를 묶어 올리세요)
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button type="submit" disabled={saving} className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
            {saving ? (progress || "등록 중...") : `${files.length > 0 ? files.length + "개 " : ""}문제 등록`}
          </button>
        </form>

        {/* 검색 + 목록 */}
        <div className="mt-10 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium text-[var(--foreground)]">등록된 문제 {problems.length}개</h2>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="ml-auto rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm">
            <option value="">전체 학교급</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="text" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} placeholder="과정 검색" className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm" />
          <input type="text" value={filterUnit} onChange={(e) => setFilterUnit(e.target.value)} placeholder="단원 검색" className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-1.5 text-sm" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((p) => (
            <div key={p.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
              <ProblemBody
                problem={p}
                imgClassName="w-full rounded-lg border border-[var(--border-c)]"
                textClassName="rounded-lg border border-[var(--border-c)] bg-[var(--pink-light)]/20 p-3 text-sm leading-relaxed text-[var(--foreground)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {p.subject === "english" && (
                  <span className="rounded-full bg-[var(--pink)] px-2.5 py-0.5 font-medium text-[var(--pink-dark)]">영어</span>
                )}
                <span className="rounded-full bg-[var(--mint)] px-2.5 py-0.5 font-medium text-[var(--mint-dark)]">{p.category}</span>
                {p.course_level && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{p.course_level}</span>}
                {p.unit && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{p.unit}</span>}
                {p.problem_format && <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[var(--secondary)]">{p.problem_format}</span>}
                <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[var(--secondary)]">{p.difficulty}</span>
                {p.answer && <span className="text-[var(--secondary)]">정답 {p.answer}</span>}
                {p.solution_text
                  ? <span className="rounded-full bg-[var(--mint)] px-2 py-0.5 text-[var(--mint-dark)]">풀이 있음</span>
                  : <span className="rounded-full border border-dashed border-[var(--border-c)] px-2 py-0.5 text-[var(--secondary)]">풀이 없음</span>}
              </div>
              <div className="mt-2 flex gap-3">
                <button onClick={() => toggleSolve(p)} className="text-xs text-[var(--mint-dark)] underline">
                  {solveOpen === p.id ? "풀이 닫기" : "풀이 검수"}
                </button>
                <button onClick={() => handleDelete(p)} className="text-xs text-red-600 underline">삭제</button>
              </div>

              {/* 풀이 검수 패널: AI 초안 생성 → 검토·수정 → 저장(승인) */}
              {solveOpen === p.id && (
                <div className="mt-3 rounded-xl border border-[var(--border-c)] bg-[var(--background)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[var(--foreground)]">풀이 (검수 후 저장해야 학생에게 보입니다)</p>
                    <button
                      onClick={() => generateSolution(p)}
                      disabled={solveGenLoading}
                      className="rounded-full bg-[var(--pink)] px-3 py-1 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-60"
                    >
                      {solveGenLoading ? "생성 중..." : "AI 풀이 초안"}
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={solveDraft}
                    onChange={(e) => setSolveDraft(e.target.value)}
                    placeholder="풀이를 직접 쓰거나, AI 초안을 만든 뒤 검토·수정하세요. 수식은 $...$"
                    className="mt-2 w-full rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                  />
                  {solveDraft.trim() && (
                    <div className="mt-2 rounded-lg border border-dashed border-[var(--border-c)] bg-white p-2">
                      <p className="mb-1 text-[10px] text-[var(--secondary)]">학생 화면 미리보기</p>
                      <MathText text={solveDraft} className="text-sm leading-relaxed text-[var(--foreground)]" />
                    </div>
                  )}
                  {solveMsg && <p className="mt-2 text-xs text-[var(--mint-dark)]">{solveMsg}</p>}
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => saveSolution(p)}
                      disabled={solveSaving}
                      className="rounded-full bg-[var(--mint)] px-4 py-1.5 text-xs font-medium text-[var(--mint-dark)] disabled:opacity-60"
                    >
                      {solveSaving ? "저장 중..." : "풀이 저장 (검수 승인)"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
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
