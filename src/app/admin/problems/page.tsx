"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody, MathText } from "@/components/ProblemBody";
import { canManageMaterials } from "@/lib/roles";
import { useSubject } from "@/lib/subject";
import { CATEGORIES, DIFFICULTIES, FORMATS, type Problem } from "@/lib/problems";
import { useAdminListQuery, type FilterFieldDef, type SortOptionDef } from "@/lib/admin/useAdminListQuery";
import type { StatusCountOption } from "@/lib/admin/list-query";
import {
  SummaryCountBar,
  FilterBar,
  SortSelect,
  BulkActionBar,
  Pagination,
  SelectAllCheckbox,
} from "@/components/admin/ManagedList";

const EMPTY = {
  category: "고등" as string,
  courseLevel: "",
  unit: "",
  problemFormat: "" as string,
  difficulty: "중" as string,
  answers: "", // 콤마로 여러 정답: ③,①,④
  memo: "",
};

const asOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

const FILTER_DEFS: FilterFieldDef[] = [
  { key: "category", label: "전체 학교급", kind: "select", column: "category", options: asOptions(CATEGORIES) },
  { key: "courseLevel", label: "과정 검색", kind: "text", column: "course_level" },
  { key: "unit", label: "단원 검색", kind: "text", column: "unit" },
  { key: "problemFormat", label: "전체 유형", kind: "select", column: "problem_format", options: asOptions(FORMATS) },
  { key: "difficulty", label: "전체 난이도", kind: "select", column: "difficulty", options: asOptions(DIFFICULTIES) },
];

const SORT_OPTIONS: SortOptionDef[] = [
  { value: "newest", label: "최신순", column: "created_at", ascending: false },
  { value: "pending_first", label: "검수대기 우선", column: "solution_text", ascending: true, nullsFirst: true },
  { value: "difficulty", label: "난이도순(상→하)", column: "difficulty", ascending: true },
];

const STATUS_OPTIONS: StatusCountOption[] = [
  { key: "all", label: "전체", status: { kind: "none" } },
  { key: "absent", label: "풀이 없음", status: { kind: "isNull", column: "solution_text" } },
  { key: "present", label: "풀이 있음", status: { kind: "notNull", column: "solution_text" } },
];

type BulkProgress = { total: number; done: number; failed: { id: string; reason: string }[] };

export default function AdminProblemsPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useAdminListQuery<Problem>({
    paramPrefix: "prob",
    table: "problems",
    baseEq: [{ column: "subject", value: subject }],
    filterDefs: FILTER_DEFS,
    statusOptions: STATUS_OPTIONS,
    sortOptions: SORT_OPTIONS,
    pageSize: 24,
  });

  // 풀이 검수 패널 (문제별) — 기존 개별 검수 화면은 그대로 유지
  const [solveOpen, setSolveOpen] = useState<string | null>(null);
  const [solveDraft, setSolveDraft] = useState("");
  const [solveGenLoading, setSolveGenLoading] = useState(false);
  const [solveSaving, setSolveSaving] = useState(false);
  const [solveMsg, setSolveMsg] = useState<string | null>(null);

  // 일괄 AI 풀이 생성 — 저장 전까지는 화면에만 임시 보관(DB에 안 씀). 개별 검수·저장은 기존 그대로.
  const [bulkDrafts, setBulkDrafts] = useState<Map<string, string>>(new Map());
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);

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
      list.reload();
    }
  }

  async function handleDelete(p: Problem) {
    if (!confirm("이 문제를 삭제할까요?")) return;
    const { error } = await createClient().from("problems").delete().eq("id", p.id);
    if (error) { setError(`삭제 실패: ${error.message}`); return; }
    setMessage("삭제했습니다.");
    list.reload();
  }

  async function handleBulkDelete() {
    const ids = Array.from(list.selected);
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}개 문제를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const { error } = await createClient().from("problems").delete().in("id", ids);
    if (error) { setError(`일괄 삭제 실패: ${error.message}`); return; }
    setMessage(`${ids.length}개 삭제했습니다.`);
    list.clearSelection();
    list.reload();
  }

  // 풀이 검수 패널 열기/닫기 — 일괄생성 초안이 있으면 그걸 먼저 보여준다(없으면 저장된 것)
  function toggleSolve(p: Problem) {
    setSolveMsg(null);
    if (solveOpen === p.id) { setSolveOpen(null); return; }
    setSolveOpen(p.id);
    setSolveDraft(bulkDrafts.get(p.id) ?? p.solution_text ?? "");
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
    setBulkDrafts((prev) => { const next = new Map(prev); next.delete(p.id); return next; });
    list.reload();
  }

  // 선택한 문제들에 대해 순차적으로 AI 풀이 초안을 생성한다. 저장은 안 함(화면에만 보관) —
  // 각 문제를 "풀이 검수"로 열어 검토 후 직접 저장해야 학생에게 노출된다.
  async function generateSolutionsFor(targets: Problem[]) {
    setBulkProgress({ total: targets.length, done: 0, failed: [] });
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const nextDrafts = new Map(bulkDrafts);
    let done = 0;
    const failed: { id: string; reason: string }[] = [];

    for (const p of targets) {
      try {
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
        if (!res.ok || !data.ok) throw new Error(data.message ?? "생성 실패");
        nextDrafts.set(p.id, data.solution);
      } catch (e) {
        failed.push({ id: p.id, reason: e instanceof Error ? e.message : "알 수 없는 오류" });
      }
      done++;
      setBulkProgress({ total: targets.length, done, failed: [...failed] });
      setBulkDrafts(new Map(nextDrafts));
    }
  }

  async function handleBulkGenerateSolutions() {
    const targets = list.rows.filter((p) => list.selected.has(p.id));
    if (targets.length === 0) return;
    if (
      !confirm(
        `선택한 ${targets.length}개 문제의 AI 풀이 초안을 생성할까요?\n생성만 되고 저장은 안 됩니다 — 각 문제를 "풀이 검수"로 열어 확인 후 저장해야 학생에게 보입니다.`
      )
    )
      return;
    list.clearSelection();
    await generateSolutionsFor(targets);
  }

  function retryFailedBulk() {
    if (!bulkProgress || bulkProgress.failed.length === 0) return;
    const failedIds = new Set(bulkProgress.failed.map((f) => f.id));
    const targets = list.rows.filter((p) => failedIds.has(p.id));
    if (targets.length === 0) {
      setError("실패한 문제가 지금 페이지 목록에 없어 재시도할 수 없습니다. 필터로 다시 찾아 선택해주세요.");
      return;
    }
    generateSolutionsFor(targets);
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

  const allOnPageSelected = list.rows.length > 0 && list.rows.every((p) => list.selected.has(p.id));

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

        {/* 요약 카운트 + 필터 + 정렬 */}
        <div className="mt-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-[var(--foreground)]">등록된 문제 {list.totalCount.toLocaleString()}개</h2>
            <SortSelect options={SORT_OPTIONS} value={list.sortValue} onChange={list.setSort} />
          </div>
          <SummaryCountBar
            options={STATUS_OPTIONS}
            counts={list.statusCounts}
            value={list.statusKey}
            onChange={list.setStatus}
          />
          <FilterBar defs={FILTER_DEFS} values={list.filters} onChange={list.setFilter} onClear={list.clearFilters} />
          {list.rows.length > 0 && (
            <SelectAllCheckbox checked={allOnPageSelected} onChange={list.toggleSelectAllOnPage} label="이 페이지 전체 선택" />
          )}
        </div>

        {list.loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : list.error ? (
          <p className="mt-8 text-sm text-red-600">{list.error}</p>
        ) : list.rows.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">조건에 맞는 문제가 없습니다.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.rows.map((p) => (
              <div key={p.id} className={`rounded-2xl border bg-white p-4 ${list.selected.has(p.id) ? "border-[var(--pink)]" : "border-[var(--border-c)]"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs text-[var(--secondary)]">
                    <input
                      type="checkbox"
                      checked={list.selected.has(p.id)}
                      onChange={() => list.toggleSelect(p.id)}
                      className="h-4 w-4 accent-[var(--pink)]"
                    />
                    선택
                  </label>
                  {bulkDrafts.has(p.id) && (
                    <span className="rounded-full bg-[var(--pink-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--pink-dark)]">
                      AI 초안 준비됨
                    </span>
                  )}
                </div>
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

                {/* 풀이 검수 패널: AI 초안 생성(개별 또는 일괄) → 검토·수정 → 저장(승인) */}
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
        )}

        <div className="mt-6">
          <Pagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.goToPage} />
        </div>

        {/* 일괄 AI 풀이 생성 진행 상황 */}
        {bulkProgress && (
          <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-4">
            <p className="text-sm text-[var(--foreground)]">
              AI 풀이 일괄 생성: {bulkProgress.total}개 중 {bulkProgress.done}개 완료
              {bulkProgress.failed.length > 0 && ` · 실패 ${bulkProgress.failed.length}개`}
            </p>
            {bulkProgress.done < bulkProgress.total && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--mint)]/20">
                <div
                  className="h-full rounded-full bg-[var(--mint)] transition-all"
                  style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                />
              </div>
            )}
            {bulkProgress.failed.length > 0 && bulkProgress.done === bulkProgress.total && (
              <div className="mt-2">
                <ul className="text-xs text-red-600">
                  {bulkProgress.failed.map((f) => (
                    <li key={f.id}>문제 {f.id.slice(0, 8)}… — {f.reason}</li>
                  ))}
                </ul>
                <button onClick={retryFailedBulk} className="mt-2 rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--mint)]/20">
                  실패한 항목 재시도
                </button>
              </div>
            )}
            {bulkProgress.done === bulkProgress.total && (
              <p className="mt-2 text-xs text-[var(--secondary)]">
                생성된 초안은 저장되지 않았습니다. &quot;AI 초안 준비됨&quot; 표시된 문제를 열어(풀이 검수) 확인 후 저장해주세요.
              </p>
            )}
          </div>
        )}
      </main>

      {/* 일괄 작업 바 */}
      <div className="mx-auto max-w-5xl px-6">
        <BulkActionBar
          selectedCount={list.selected.size}
          onClear={list.clearSelection}
          actions={[
            { label: "선택한 문제 AI 풀이 일괄 생성", onClick: handleBulkGenerateSolutions },
            { label: "선택 삭제", onClick: handleBulkDelete, tone: "danger" },
          ]}
        />
      </div>

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
