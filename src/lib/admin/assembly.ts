// 대량 문제 규칙 기반 출제(STAGE 5) 로직. 조건(criteria)을 받아 문제를 자동으로
// 뽑는 부분만 담당한다 — 화면은 app/admin/assemble/page.tsx.

import { createClient } from "@/lib/supabase/client";
import type { Problem } from "@/lib/problems";

export type Distribution = Record<string, number>; // 예: {"하":20,"중":60,"상":20}, 비율(%)

export type AssemblyCriteria = {
  category: string[]; // 빈 배열 = 무관
  courseLevel: string[]; // 빈 배열 = 무관
  unit: string[]; // 빈 배열 = 무관
  difficultyDistribution: Distribution | null; // null = 무관
  problemFormatDistribution: Distribution | null; // null = 무관
  count: number;
  excludeRecentDays: number | null; // null = 제외 안 함
};

export type ProblemLite = Pick<
  Problem,
  "id" | "category" | "course_level" | "unit" | "difficulty" | "problem_format" | "content_text" | "image_url" | "answer" | "problem_type"
>;

type Stratum = { difficulty: string | null; problemFormat: string | null; targetCount: number };

function normalizeDist(dist: Distribution | null): { key: string | null; pct: number }[] {
  if (!dist) return [{ key: null, pct: 100 }];
  const entries = Object.entries(dist).filter(([, p]) => p > 0);
  if (entries.length === 0) return [{ key: null, pct: 100 }];
  const total = entries.reduce((s, [, p]) => s + p, 0);
  return entries.map(([key, p]) => ({ key, pct: (p / total) * 100 }));
}

// 난이도×유형 두 분포를 교차시켜 층(stratum)을 만든다. 반올림 오차는 마지막 층에서 보정한다.
export function buildStrata(criteria: Pick<AssemblyCriteria, "difficultyDistribution" | "problemFormatDistribution" | "count">): Stratum[] {
  const diffs = normalizeDist(criteria.difficultyDistribution);
  const formats = normalizeDist(criteria.problemFormatDistribution);
  const strata: Stratum[] = [];
  for (const d of diffs) {
    for (const f of formats) {
      const pct = (d.pct / 100) * (f.pct / 100);
      const targetCount = Math.round(pct * criteria.count);
      if (targetCount > 0) strata.push({ difficulty: d.key, problemFormat: f.key, targetCount });
    }
  }
  if (strata.length === 0) return [{ difficulty: null, problemFormat: null, targetCount: criteria.count }];
  const sum = strata.reduce((s, x) => s + x.targetCount, 0);
  if (sum !== criteria.count) strata[strata.length - 1].targetCount += criteria.count - sum;
  return strata;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CANDIDATE_FETCH_CAP = 300; // 층 하나당 후보를 이 개수까지만 가져와 랜덤 추출(전체 스캔 방지)

async function fetchCandidatesForStratum(
  criteria: Pick<AssemblyCriteria, "category" | "courseLevel" | "unit">,
  stratum: { difficulty: string | null; problemFormat: string | null },
  subject: string
): Promise<ProblemLite[]> {
  const supabase = createClient();
  let q = supabase
    .from("problems")
    .select("id, category, course_level, unit, difficulty, problem_format, content_text, image_url, answer, problem_type")
    .eq("subject", subject)
    .eq("verified", true);
  if (criteria.category.length) q = q.in("category", criteria.category);
  if (criteria.courseLevel.length) q = q.in("course_level", criteria.courseLevel);
  if (criteria.unit.length) q = q.in("unit", criteria.unit);
  if (stratum.difficulty) q = q.eq("difficulty", stratum.difficulty);
  if (stratum.problemFormat) q = q.eq("problem_format", stratum.problemFormat);
  q = q.limit(CANDIDATE_FETCH_CAP);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProblemLite[];
}

// "최근 N일 내 학생에게 배포된 적 있는 문제" id 집합 — 제외조건용.
export async function fetchRecentlyAssignedProblemIds(days: number): Promise<Set<string>> {
  const supabase = createClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: assignments } = await supabase.from("worksheet_assignments").select("worksheet_id").gte("assigned_at", cutoff);
  const worksheetIds = Array.from(new Set((assignments ?? []).map((r) => r.worksheet_id)));
  if (worksheetIds.length === 0) return new Set();
  const { data: wp } = await supabase.from("worksheet_problems").select("problem_id").in("worksheet_id", worksheetIds);
  return new Set((wp ?? []).map((r) => r.problem_id as string));
}

export type StratumOutcome = {
  difficulty: string | null;
  problemFormat: string | null;
  targetCount: number;
  gotCount: number;
};

export type PickedProblem = ProblemLite & { stratumDifficulty: string | null; stratumFormat: string | null };

export type AssemblyGenerateResult = {
  picked: PickedProblem[]; // 최종 뽑힌 문제(순서 섞임)
  strata: StratumOutcome[];
  shortages: { label: string; needed: number; available: number }[];
};

export async function generateAssembly(criteria: AssemblyCriteria, subject: string): Promise<AssemblyGenerateResult> {
  const strata = buildStrata(criteria);
  const excludeIds = criteria.excludeRecentDays ? await fetchRecentlyAssignedProblemIds(criteria.excludeRecentDays) : new Set<string>();
  const usedIds = new Set<string>();
  const outcomes: StratumOutcome[] = [];
  const pickedByStratum: PickedProblem[][] = [];

  for (const s of strata) {
    const candidates = (await fetchCandidatesForStratum(criteria, s, subject)).filter(
      (p) => !excludeIds.has(p.id) && !usedIds.has(p.id)
    );
    const picked = shuffle(candidates).slice(0, s.targetCount);
    picked.forEach((p) => usedIds.add(p.id));
    outcomes.push({ difficulty: s.difficulty, problemFormat: s.problemFormat, targetCount: s.targetCount, gotCount: picked.length });
    pickedByStratum.push(picked.map((p) => ({ ...p, stratumDifficulty: s.difficulty, stratumFormat: s.problemFormat })));
  }

  const shortages = outcomes
    .filter((o) => o.gotCount < o.targetCount)
    .map((o) => ({
      label: `${o.difficulty ?? "난이도 무관"} · ${o.problemFormat ?? "유형 무관"}`,
      needed: o.targetCount,
      available: o.gotCount,
    }));

  return { picked: shuffle(pickedByStratum.flat()), strata: outcomes, shortages };
}

// "다시 뽑기": 같은 층(난이도·유형 조합)에서 지금 세트에 없는 문제 하나를 새로 뽑는다.
export async function redrawOne(
  criteria: Pick<AssemblyCriteria, "category" | "courseLevel" | "unit" | "excludeRecentDays">,
  subject: string,
  stratum: { difficulty: string | null; problemFormat: string | null },
  excludeIds: Set<string>
): Promise<PickedProblem | null> {
  const recentExclude = criteria.excludeRecentDays ? await fetchRecentlyAssignedProblemIds(criteria.excludeRecentDays) : new Set<string>();
  const candidates = (await fetchCandidatesForStratum(criteria, stratum, subject)).filter(
    (p) => !excludeIds.has(p.id) && !recentExclude.has(p.id)
  );
  if (candidates.length === 0) return null;
  const picked = shuffle(candidates)[0];
  return { ...picked, stratumDifficulty: stratum.difficulty, stratumFormat: stratum.problemFormat };
}

export async function saveAssemblyResult(params: {
  criteria: AssemblyCriteria;
  problemIds: string[];
  userId: string;
  ruleId?: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("assembly_results")
    .insert({
      rule_id: params.ruleId ?? null,
      rule_snapshot: params.criteria,
      problem_ids: params.problemIds,
      generated_by: params.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

// ===== STAGE 6: 규칙 저장(템플릿화) =====

export type AssemblyRule = {
  id: string;
  name: string;
  subject: string;
  criteria: AssemblyCriteria;
  createdAt: string;
  lastUsedAt: string | null;
};

export async function saveRule(params: { name: string; subject: string; criteria: AssemblyCriteria; userId: string }): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("assembly_rules")
    .insert({ name: params.name, subject: params.subject, criteria: params.criteria, created_by: params.userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function loadRules(subject: string): Promise<AssemblyRule[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("assembly_rules")
    .select("id, name, subject, criteria, created_at, last_used_at")
    .eq("subject", subject)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    criteria: r.criteria as AssemblyCriteria,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

export async function deleteRule(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("assembly_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function touchRuleLastUsed(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("assembly_rules").update({ last_used_at: new Date().toISOString() }).eq("id", id);
}

export async function recordSwap(params: {
  resultId: string;
  oldProblemId: string;
  newProblemId: string;
  newProblemIds: string[]; // 교체 후 전체 목록(순서 유지) — assembly_results.problem_ids 갱신용
  userId: string;
}): Promise<void> {
  const supabase = createClient();
  await Promise.all([
    supabase.from("assembly_results").update({ problem_ids: params.newProblemIds }).eq("id", params.resultId),
    supabase.from("assembly_result_swaps").insert({
      result_id: params.resultId,
      old_problem_id: params.oldProblemId,
      new_problem_id: params.newProblemId,
      swapped_by: params.userId,
    }),
  ]);
}

export async function confirmToWorksheet(params: {
  title: string;
  subject: string;
  problemIds: string[];
  resultId: string;
}): Promise<string> {
  const supabase = createClient();
  const { data: ws, error: wsErr } = await supabase
    .from("worksheets")
    .insert({ title: params.title, subject: params.subject })
    .select("id")
    .single();
  if (wsErr || !ws) throw new Error(wsErr?.message ?? "문제지 생성 실패");

  const rows = params.problemIds.map((id, i) => ({ worksheet_id: ws.id, problem_id: id, position: i }));
  const { error: wpErr } = await supabase.from("worksheet_problems").insert(rows);
  if (wpErr) throw new Error(wpErr.message);

  await supabase.from("assembly_results").update({ worksheet_id: ws.id }).eq("id", params.resultId);
  return ws.id;
}

// 조건 입력 화면의 과정/단원 다중선택 칸을 채우기 위한, 실제 존재하는 값 목록.
export async function fetchDistinctValues(params: {
  subject: string;
  column: "course_level" | "unit";
  category?: string[];
  courseLevel?: string[];
}): Promise<string[]> {
  const supabase = createClient();
  let q = supabase
    .from("problems")
    .select(params.column)
    .eq("subject", params.subject)
    .eq("verified", true)
    .not(params.column, "is", null);
  if (params.category?.length) q = q.in("category", params.category);
  if (params.column === "unit" && params.courseLevel?.length) q = q.in("course_level", params.courseLevel);
  const { data } = await q.limit(3000);
  const set = new Set<string>();
  (data ?? []).forEach((r) => {
    const v = (r as Record<string, string | null>)[params.column];
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}
