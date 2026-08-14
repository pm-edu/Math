"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ProblemBody } from "@/components/ProblemBody";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import { useSubject } from "@/lib/subject";
import { CATEGORIES, DIFFICULTIES, FORMATS, type Problem } from "@/lib/problems";
import { CURRICULUM_GROUPS, CURRICULUM_DETAILS, curriculumGroupLabel, curriculumDetailLabel, type CurriculumGroup } from "@/lib/curriculum";
import {
  generateAssembly,
  redrawOne,
  recordSwap,
  saveAssemblyResult,
  confirmToWorksheet,
  fetchDistinctValues,
  saveRule,
  loadRules,
  deleteRule,
  touchRuleLastUsed,
  type AssemblyCriteria,
  type AssemblyRule,
  type PickedProblem,
} from "@/lib/admin/assembly";

type DistMode = "무관" | "비율";

export default function AdminAssemblePage() {
  const router = useRouter();
  const { subject } = useSubject();
  const isMath = subject === "math";
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // 조건 입력 — 영어(SAT 등)는 category/courseLevel, 수학은 curriculumGroup/curriculumDetail
  const [category, setCategory] = useState<string[]>([]);
  const [courseLevel, setCourseLevel] = useState<string[]>([]);
  const [curriculumGroup, setCurriculumGroup] = useState<string[]>([]);
  const [curriculumDetail, setCurriculumDetail] = useState<string[]>([]);
  const [unit, setUnit] = useState<string[]>([]);
  const [courseLevelOptions, setCourseLevelOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

  const [difficultyMode, setDifficultyMode] = useState<DistMode>("무관");
  const [difficultyDist, setDifficultyDist] = useState<Record<string, number>>({ 하: 20, 중: 60, 상: 20 });
  const [formatMode, setFormatMode] = useState<DistMode>("무관");
  const [formatDist, setFormatDist] = useState<Record<string, number>>({ 객관식: 70, 서술형: 30 });

  const [count, setCount] = useState(20);
  const [excludeRecentDays, setExcludeRecentDays] = useState("");

  // 템플릿(저장된 규칙)
  const [rules, setRules] = useState<AssemblyRule[]>([]);
  const [loadedRuleId, setLoadedRuleId] = useState<string | null>(null);
  const [newRuleName, setNewRuleName] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  // 생성 결과
  const [generating, setGenerating] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedProblem[]>([]);
  const [shortages, setShortages] = useState<{ label: string; needed: number; available: number }[]>([]);
  const [redrawingId, setRedrawingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [confirmedUrl, setConfirmedUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) { setAllowed(false); return; }
      setUserId(auth.user.id);
      setAllowed(true);
    }
    init();
  }, [router]);

  useEffect(() => {
    if (!allowed || isMath) return;
    fetchDistinctValues({ subject, column: "course_level", category }).then(setCourseLevelOptions);
  }, [allowed, subject, isMath, category]);

  useEffect(() => {
    if (!allowed) return;
    // 수학은 curriculum_group/detail이 고정 목록이라 단원만 subject 기준으로 조회한다(카테고리 캐스케이드 불필요).
    if (isMath) fetchDistinctValues({ subject, column: "unit" }).then(setUnitOptions);
    else fetchDistinctValues({ subject, column: "unit", category, courseLevel }).then(setUnitOptions);
  }, [allowed, subject, isMath, category, courseLevel]);

  useEffect(() => {
    if (!allowed) return;
    loadRules(subject).then(setRules);
  }, [allowed, subject]);

  function applyRule(rule: AssemblyRule) {
    const c = rule.criteria;
    setCategory(c.category ?? []);
    setCourseLevel(c.courseLevel ?? []);
    setCurriculumGroup(c.curriculumGroup ?? []);
    setCurriculumDetail(c.curriculumDetail ?? []);
    setUnit(c.unit);
    setDifficultyMode(c.difficultyDistribution ? "비율" : "무관");
    if (c.difficultyDistribution) setDifficultyDist(c.difficultyDistribution);
    setFormatMode(c.problemFormatDistribution ? "비율" : "무관");
    if (c.problemFormatDistribution) setFormatDist(c.problemFormatDistribution);
    setCount(c.count);
    setExcludeRecentDays(c.excludeRecentDays ? String(c.excludeRecentDays) : "");
    setLoadedRuleId(rule.id);
    setResultId(null);
    setPicked([]);
    setConfirmedUrl(null);
  }

  function startCustom() {
    setLoadedRuleId(null);
  }

  async function handleSaveRule() {
    if (!userId) return;
    if (!newRuleName.trim()) { setError("템플릿 이름을 입력해주세요."); return; }
    setSavingRule(true);
    setError(null);
    try {
      const criteria: AssemblyCriteria = {
        category, courseLevel, curriculumGroup, curriculumDetail, unit,
        difficultyDistribution: difficultyMode === "비율" ? difficultyDist : null,
        problemFormatDistribution: formatMode === "비율" ? formatDist : null,
        count,
        excludeRecentDays: excludeRecentDays.trim() ? Number(excludeRecentDays) : null,
      };
      const id = await saveRule({ name: newRuleName.trim(), subject, criteria, userId });
      setNewRuleName("");
      setLoadedRuleId(id);
      setRules(await loadRules(subject));
      setMessage(`"${newRuleName.trim()}" 템플릿으로 저장했습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿 저장 실패");
    } finally {
      setSavingRule(false);
    }
  }

  async function handleDeleteRule(rule: AssemblyRule) {
    if (!confirm(`"${rule.name}" 템플릿을 삭제할까요?`)) return;
    try {
      await deleteRule(rule.id);
      if (loadedRuleId === rule.id) setLoadedRuleId(null);
      setRules(await loadRules(subject));
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿 삭제 실패");
    }
  }

  function toggleIn(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleGenerate() {
    if (!userId) return;
    setError(null); setMessage(null); setConfirmedUrl(null);
    setGenerating(true);
    try {
      const criteria: AssemblyCriteria = {
        category,
        courseLevel,
        curriculumGroup,
        curriculumDetail,
        unit,
        difficultyDistribution: difficultyMode === "비율" ? difficultyDist : null,
        problemFormatDistribution: formatMode === "비율" ? formatDist : null,
        count,
        excludeRecentDays: excludeRecentDays.trim() ? Number(excludeRecentDays) : null,
      };
      const result = await generateAssembly(criteria, subject);
      const id = await saveAssemblyResult({ criteria, problemIds: result.picked.map((p) => p.id), userId, ruleId: loadedRuleId });
      if (loadedRuleId) {
        touchRuleLastUsed(loadedRuleId);
        setRules((prev) => prev.map((r) => (r.id === loadedRuleId ? { ...r, lastUsedAt: new Date().toISOString() } : r)));
      }
      setResultId(id);
      setPicked(result.picked);
      setShortages(result.shortages);
      setWorksheetTitle("");
      if (result.picked.length === 0) {
        setError("조건에 맞는 문제를 하나도 찾지 못했습니다. 조건을 넓혀보세요.");
      } else {
        setMessage(`${result.picked.length}개 문제를 뽑았습니다.` + (result.shortages.length > 0 ? " 일부 조건은 후보가 부족합니다 — 아래 확인해주세요." : ""));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRedraw(target: PickedProblem) {
    if (!resultId) return;
    setRedrawingId(target.id);
    setError(null);
    try {
      const excludeIds = new Set(picked.map((p) => p.id));
      const next = await redrawOne(
        { category, courseLevel, curriculumGroup, curriculumDetail, unit, excludeRecentDays: excludeRecentDays.trim() ? Number(excludeRecentDays) : null },
        subject,
        { difficulty: target.stratumDifficulty, problemFormat: target.stratumFormat },
        excludeIds
      );
      if (!next) {
        setError("같은 조건으로 바꿔 뽑을 다른 후보가 없습니다.");
        return;
      }
      const nextPicked = picked.map((p) => (p.id === target.id ? next : p));
      setPicked(nextPicked);
      await recordSwap({
        resultId,
        oldProblemId: target.id,
        newProblemId: next.id,
        newProblemIds: nextPicked.map((p) => p.id),
        userId: userId!,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 뽑기 중 오류가 발생했습니다.");
    } finally {
      setRedrawingId(null);
    }
  }

  async function handleConfirm() {
    if (!resultId || picked.length === 0) return;
    if (!worksheetTitle.trim()) { setError("문제지 이름을 입력해주세요."); return; }
    setConfirming(true);
    setError(null);
    try {
      await confirmToWorksheet({ title: worksheetTitle.trim(), subject, problemIds: picked.map((p) => p.id), resultId });
      setConfirmedUrl("/admin/worksheets");
      setMessage(`"${worksheetTitle.trim()}" 문제지를 만들었습니다. 문제지·배포 화면에서 학생에게 배정하세요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정 중 오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) return (
    <Shell>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
      <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
    </Shell>
  );

  // 수학 세부 과정 칩: 고른 커리큘럼 그룹들의 세부과정을 합쳐 보여준다(그룹 안 고르면 아직 없음).
  const mathDetailOptions = curriculumGroup.length > 0
    ? curriculumGroup.flatMap((g) => CURRICULUM_DETAILS[g as CurriculumGroup] ?? [])
    : [];

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs ${active ? "border-[var(--pink)] bg-[var(--pink-light)]/40 text-[var(--pink-dark)]" : "border-[var(--border-c)] bg-white text-[var(--secondary)] hover:bg-[var(--mint)]/10"}`;
  const inputClass = "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">규칙으로 자동 출제</h1>
        <p className="mt-2 text-[var(--secondary)]">조건을 정하면 조건에 맞는 문제를 무작위로 뽑아 문제지 초안을 만들어줍니다.</p>

        {/* 저장된 템플릿 */}
        {rules.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">저장된 템플릿</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={startCustom} className={chipClass(loadedRuleId === null)}>
                직접 입력
              </button>
              {rules.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => applyRule(r)} className={chipClass(loadedRuleId === r.id)}>
                    {r.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(r)}
                    className="text-xs text-red-500 hover:text-red-700"
                    title="템플릿 삭제"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--secondary)]">
              템플릿을 고르면 아래 조건이 자동으로 채워집니다. 같은 템플릿으로 "생성"을 여러 번 누르면 매번 다른 문제 조합이 나옵니다.
            </p>
          </div>
        )}

        {/* 조건 입력 */}
        <div className="mt-6 space-y-5 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          {isMath ? (
            <>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">커리큘럼 (안 고르면 전체)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CURRICULUM_GROUPS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => toggleIn(curriculumGroup, setCurriculumGroup, g.value)}
                      className={chipClass(curriculumGroup.includes(g.value))}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  세부 과정 (안 고르면 전체) {curriculumGroup.length === 0 && "— 커리큘럼을 먼저 선택하세요"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mathDetailOptions.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleIn(curriculumDetail, setCurriculumDetail, d.value)}
                      className={chipClass(curriculumDetail.includes(d.value))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">학교급 (안 고르면 전체)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button key={c} type="button" onClick={() => toggleIn(category, setCategory, c)} className={chipClass(category.includes(c))}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">과정 (안 고르면 전체) {courseLevelOptions.length === 0 && "— 등록된 값 없음"}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {courseLevelOptions.map((v) => (
                    <button key={v} type="button" onClick={() => toggleIn(courseLevel, setCourseLevel, v)} className={chipClass(courseLevel.includes(v))}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">단원 (안 고르면 전체) {unitOptions.length === 0 && "— 등록된 값 없음"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unitOptions.map((v) => (
                <button key={v} type="button" onClick={() => toggleIn(unit, setUnit, v)} className={chipClass(unit.includes(v))}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--foreground)]">난이도 분포</p>
                <select value={difficultyMode} onChange={(e) => setDifficultyMode(e.target.value as DistMode)} className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1 text-xs">
                  <option value="무관">무관</option>
                  <option value="비율">비율 지정</option>
                </select>
              </div>
              {difficultyMode === "비율" && (
                <div className="mt-2 flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <label key={d} className="flex items-center gap-1 text-xs text-[var(--secondary)]">
                      {d}
                      <input
                        type="number" min={0} max={100}
                        value={difficultyDist[d] ?? 0}
                        onChange={(e) => setDifficultyDist({ ...difficultyDist, [d]: Number(e.target.value) })}
                        className="w-14 rounded border border-[var(--border-c)] px-1.5 py-1"
                      />
                      %
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--foreground)]">유형 분포</p>
                <select value={formatMode} onChange={(e) => setFormatMode(e.target.value as DistMode)} className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1 text-xs">
                  <option value="무관">무관</option>
                  <option value="비율">비율 지정</option>
                </select>
              </div>
              {formatMode === "비율" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {FORMATS.map((f) => (
                    <label key={f} className="flex items-center gap-1 text-xs text-[var(--secondary)]">
                      {f}
                      <input
                        type="number" min={0} max={100}
                        value={formatDist[f] ?? 0}
                        onChange={(e) => setFormatDist({ ...formatDist, [f]: Number(e.target.value) })}
                        className="w-14 rounded border border-[var(--border-c)] px-1.5 py-1"
                      />
                      %
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">문항 수</label>
              <input type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass} />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">최근 며칠 내 출제된 문제 제외 (선택)</label>
              <input type="number" min={0} value={excludeRecentDays} onChange={(e) => setExcludeRecentDays(e.target.value)} placeholder="비워두면 제외 안 함" className={inputClass} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleGenerate} disabled={generating} className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60">
              {generating ? "생성 중..." : "생성"}
            </button>
            <span className="text-[var(--secondary)]">|</span>
            <input
              type="text" value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)}
              placeholder="템플릿 이름 (예: 중2 2학기 중간고사 세트)"
              className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
            <button onClick={handleSaveRule} disabled={savingRule} className="whitespace-nowrap rounded-full border border-[var(--border-c)] bg-white px-5 py-2.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/20 disabled:opacity-60">
              {savingRule ? "저장 중..." : "이 조건을 템플릿으로 저장"}
            </button>
          </div>
        </div>

        {/* 결과 미리보기 */}
        {resultId && (
          <div className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium text-[var(--foreground)]">결과 미리보기 ({picked.length}개)</h2>
              {picked.length > 0 && !confirmedUrl && (
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={worksheetTitle} onChange={(e) => setWorksheetTitle(e.target.value)}
                    placeholder="문제지 이름 (예: 중2 2학기 중간고사)"
                    className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                  />
                  <button onClick={handleConfirm} disabled={confirming} className="whitespace-nowrap rounded-full bg-[var(--mint)] px-5 py-2 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60">
                    {confirming ? "만드는 중..." : "이 세트로 확정"}
                  </button>
                </div>
              )}
            </div>

            {confirmedUrl && (
              <p className="mt-3 text-sm">
                <Link href={confirmedUrl} className="text-[var(--mint-dark)] underline">문제지·배포 화면에서 학생에게 배정하기 →</Link>
              </p>
            )}

            {shortages.length > 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-red-300 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-medium">일부 조건은 후보가 부족합니다:</p>
                <ul className="mt-1 list-disc pl-5">
                  {shortages.map((s, i) => (
                    <li key={i}>{s.label}: {s.needed}개 필요하지만 후보 {s.available}개뿐</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {picked.map((p) => (
                <div key={p.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {isMath ? (
                      <>
                        <span className="rounded-full bg-[var(--mint)] px-2.5 py-0.5 font-medium text-[var(--mint-dark)]">{curriculumGroupLabel(p.curriculum_group)}</span>
                        {p.curriculum_detail && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{curriculumDetailLabel(p.curriculum_group, p.curriculum_detail)}</span>}
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-[var(--mint)] px-2.5 py-0.5 font-medium text-[var(--mint-dark)]">{p.category}</span>
                        {p.course_level && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{p.course_level}</span>}
                      </>
                    )}
                    {p.unit && <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[var(--secondary)]">{p.unit}</span>}
                    <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[var(--secondary)]">{p.difficulty}</span>
                    {p.problem_format && <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[var(--secondary)]">{p.problem_format}</span>}
                  </div>
                  <div className="mt-2">
                    <ProblemBody
                      problem={p as unknown as Problem}
                      imgClassName="w-full rounded-lg border border-[var(--border-c)]"
                      textClassName="rounded-lg border border-[var(--border-c)] bg-[var(--pink-light)]/20 p-3 text-sm leading-relaxed text-[var(--foreground)]"
                    />
                  </div>
                  {!confirmedUrl && (
                    <button
                      onClick={() => handleRedraw(p)}
                      disabled={redrawingId === p.id}
                      className="mt-2 text-xs text-[var(--mint-dark)] underline disabled:opacity-60"
                    >
                      {redrawingId === p.id ? "다시 뽑는 중..." : "다시 뽑기"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
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
