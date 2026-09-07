// 수학 학습 진행 구조 PG4: 온보딩 · 진단 서버 로직 (RUN_MATH_PROGRESSION.md PG4). service role 사용.
//
// D-PG-1(1차 커리큘럼 = IGCSE 0607)이 확정값이라, 지금 실제로 문항·선수관계가 갖춰진 커리큘럼은
// IGCSE_0607뿐이다(PG-A/PG0에서 이 커리큘럼만 채움). 그래서 온보딩 화면(4-1)의 "커리큘럼 선택"은
// 지금은 IGCSE_0607 하나만 선택지로 제공한다 — 다른 curriculum_group/detail은 문항이 없어
// 진단·세션 자체가 성립하지 않는다. 다른 커리큘럼을 채우면 이 파일의 하드코딩을 없애면 된다.
//
// 진단은 커리큘럼 전체 unit을 순서대로 몇 개 골라(균등 표본) 그 유닛의 문항 하나씩을 내는
// 방식이다. "적응형"은 유닛 선택이 아니라 난이도(1~4, numeric_difficulty)에 적용된다 — 정답이면
// 다음 문항 난이도 +1, 오답이면 -1(1~4로 clamp). 맨 앞에서부터 연속으로 맞힌 구간만큼을
// "이미 아는 unit"으로 보고 커리큘럼 앞부분 전체(표본 사이에 낀 unit 포함)를 면제한다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gradeAnswer, type AnswerFormat } from "@/lib/math/grading";

export const DIAGNOSTIC_ITEM_COUNT = 12; // 지시서 "12~15문항" 범위 내
const START_DIFFICULTY = 2;

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

interface UnitRow {
  id: string;
  unit_name: string;
  sort_order: number;
  curriculum_group: string;
  curriculum_detail: string;
}

async function loadOrderedUnits(db: SupabaseClient, curriculumDetail: string): Promise<UnitRow[]> {
  const { data } = await db
    .from("curriculum_units")
    .select("id, unit_name, sort_order, curriculum_group, curriculum_detail")
    .eq("curriculum_detail", curriculumDetail)
    .not("unit_name", "ilike", "%코스워크%")
    .order("sort_order");
  return (data ?? []) as UnitRow[];
}

// 0..total-1 중 count개를 양끝 포함해서 최대한 고르게 뽑는다(단원이 count개보다 적으면 전부).
function sampleUnitIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  const indices = new Set<number>();
  for (let i = 0; i < count; i++) {
    indices.add(Math.round((i * (total - 1)) / (count - 1)));
  }
  return Array.from(indices).sort((a, b) => a - b);
}

interface ProblemRow {
  id: string;
  content_text: string;
  image_url: string;
  answer_format: AnswerFormat;
  answer_spec: unknown;
  solution_text: string;
  choices: string[] | null;
  numeric_difficulty: number | null;
  unit_id: string;
}

export interface DiagnosticItemView {
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: AnswerFormat;
  choices: string[];
}

async function pickItemForUnit(
  db: SupabaseClient,
  unitId: string,
  targetDifficulty: number,
  excludeProblemIds: string[],
  // 목표 난이도와 거리가 같은 후보가 여럿일 때(예: 목표가 3인데 실제 데이터엔 2/4만 있을 때)
  // 어느 쪽으로 기울지 — 방금 정답이면 위(어려운 쪽), 오답이면 아래(쉬운 쪽)로 깨야 "정답이면
  // 상승/오답이면 하강"이라는 적응형 의도가 지켜진다. 첫 문항(방향 없음)은 null.
  tieBreakPreferHarder: boolean | null = null
): Promise<ProblemRow | null> {
  let q = db
    .from("problems")
    .select("id, content_text, image_url, answer_format, answer_spec, solution_text, choices, numeric_difficulty, unit_id")
    .eq("unit_id", unitId)
    .eq("verified", true)
    .eq("is_auto_gradable", true);
  if (excludeProblemIds.length > 0) q = q.not("id", "in", `(${excludeProblemIds.join(",")})`);
  const { data } = await q;
  if (!data || data.length === 0) return null;
  const rows = data as ProblemRow[];
  rows.sort((a, b) => {
    const da = a.numeric_difficulty == null ? 99 : Math.abs(a.numeric_difficulty - targetDifficulty);
    const db_ = b.numeric_difficulty == null ? 99 : Math.abs(b.numeric_difficulty - targetDifficulty);
    if (da !== db_) return da - db_;
    if (tieBreakPreferHarder === null) return 0;
    return tieBreakPreferHarder
      ? (b.numeric_difficulty ?? 0) - (a.numeric_difficulty ?? 0)
      : (a.numeric_difficulty ?? 0) - (b.numeric_difficulty ?? 0);
  });
  return rows[0];
}

function toItemView(p: ProblemRow): DiagnosticItemView {
  return {
    problemId: p.id,
    contentText: p.content_text,
    imageUrl: p.image_url,
    answerFormat: p.answer_format,
    choices: p.choices ?? [],
  };
}

export interface StartDiagnosticResult {
  sessionId: number;
  position: number;
  total: number;
  item: DiagnosticItemView;
}

export async function createDiagnosticSession(userId: string, curriculumDetail: string): Promise<StartDiagnosticResult> {
  const db = serviceClient();

  const { data: activeSession } = await db
    .from("math_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (activeSession) throw new Error(`이미 진행 중인 세션이 있습니다(session_id=${activeSession.id}). 먼저 완료하거나 종료하세요.`);

  const units = await loadOrderedUnits(db, curriculumDetail);
  if (units.length === 0) throw new Error("커리큘럼 단원을 찾을 수 없습니다.");
  const sampleIdx = sampleUnitIndices(units.length, DIAGNOSTIC_ITEM_COUNT);
  const firstUnit = units[sampleIdx[0]];

  const item = await pickItemForUnit(db, firstUnit.id, START_DIFFICULTY, []);
  if (!item) throw new Error("진단 문항을 찾을 수 없습니다.");

  const { data: session, error } = await db
    .from("math_sessions")
    .insert({ user_id: userId, unit_id: firstUnit.id, kind: "diagnostic", item_count: sampleIdx.length })
    .select("id")
    .single();
  if (error || !session) throw new Error(`진단 세션 생성 실패: ${error?.message}`);

  const { error: itemErr } = await db.from("math_session_items").insert({ session_id: session.id, position: 0, problem_id: item.id });
  if (itemErr) throw new Error(`진단 문항 저장 실패: ${itemErr.message}`);

  return { sessionId: session.id, position: 0, total: sampleIdx.length, item: toItemView(item) };
}

export interface PlacementResult {
  startUnitId: string | null;
  startUnitName: string | null;
  exemptedCount: number;
}

export interface DiagnosticAnswerResult {
  correct: boolean;
  solution: string;
  done: boolean;
  next?: { position: number; total: number; item: DiagnosticItemView };
  placement?: PlacementResult;
}

async function completeDiagnostic(
  db: SupabaseClient,
  userId: string,
  session: { id: number; unit_id: string; item_count: number }
): Promise<PlacementResult> {
  const { data: firstUnitRow } = await db
    .from("curriculum_units")
    .select("curriculum_group, curriculum_detail")
    .eq("id", session.unit_id)
    .single();
  if (!firstUnitRow) throw new Error("단원 정보를 찾을 수 없습니다.");
  const curriculumGroup = firstUnitRow.curriculum_group as string;
  const curriculumDetail = firstUnitRow.curriculum_detail as string;

  const units = await loadOrderedUnits(db, curriculumDetail);
  const sampleIdx = sampleUnitIndices(units.length, session.item_count);

  const { data: items } = await db
    .from("math_session_items")
    .select("position, problem_id")
    .eq("session_id", session.id)
    .order("position");
  const { data: attempts } = await db.from("question_attempts").select("problem_id, is_correct").eq("session_id", session.id);
  const correctByProblem = new Map((attempts ?? []).map((a) => [a.problem_id, a.is_correct as boolean]));

  // 맨 앞부터 연속으로 정답인 만큼만 "이미 안다"고 본다 — 중간에 하나라도 틀리면 그 지점에서 멈춘다.
  let correctStreak = 0;
  for (const it of items ?? []) {
    if (correctByProblem.get(it.problem_id)) correctStreak++;
    else break;
  }

  let exemptedUnitIds: string[] = [];
  let startUnit = units[0] ?? null;
  if (correctStreak > 0) {
    const lastExemptSampleIdx = sampleIdx[correctStreak - 1];
    exemptedUnitIds = units.slice(0, lastExemptSampleIdx + 1).map((u) => u.id);
    startUnit = units[lastExemptSampleIdx + 1] ?? units[units.length - 1] ?? null;
  }

  const nowIso = new Date().toISOString();
  await db.from("math_placements").upsert(
    {
      user_id: userId,
      curriculum_group: curriculumGroup,
      curriculum_detail: curriculumDetail,
      exempted_unit_ids: exemptedUnitIds,
      completed_at: nowIso,
    },
    { onConflict: "user_id" }
  );

  // math_placements.exempted_unit_ids만 기록하면 v_math_next_action의 잠금 해제 판정(선수관계
  // 전부 mastered인지)이 이 정보를 몰라서 무의미해진다 — 면제 unit을 실제로 mastered로도
  // 반영해야 다음 unit이 진짜로 열린다.
  for (const unitId of exemptedUnitIds) {
    await db.from("math_unit_states").upsert(
      { user_id: userId, unit_id: unitId, status: "mastered", consecutive_failed_sessions: 0, updated_at: nowIso },
      { onConflict: "user_id,unit_id" }
    );
  }

  await db.from("math_sessions").update({ status: "completed", completed_at: nowIso }).eq("id", session.id);

  return { startUnitId: startUnit?.id ?? null, startUnitName: startUnit?.unit_name ?? null, exemptedCount: exemptedUnitIds.length };
}

export async function submitDiagnosticAnswer(userId: string, sessionId: number, submitted: string): Promise<DiagnosticAnswerResult> {
  const db = serviceClient();

  const { data: session } = await db
    .from("math_sessions")
    .select("id, unit_id, item_count, correct_count")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("kind", "diagnostic")
    .eq("status", "in_progress")
    .maybeSingle();
  if (!session) throw new Error("진행 중인 진단 세션이 아닙니다.");

  const { data: items } = await db
    .from("math_session_items")
    .select("position, problem_id")
    .eq("session_id", sessionId)
    .order("position");
  if (!items || items.length === 0) throw new Error("진단 문항을 찾을 수 없습니다.");
  const currentPosition = items.length - 1;
  const currentProblemId = items[currentPosition].problem_id;

  const { data: problem } = await db
    .from("problems")
    .select("id, unit_id, answer_format, answer_spec, solution_text, numeric_difficulty")
    .eq("id", currentProblemId)
    .single();
  if (!problem) throw new Error("문항 정보를 찾을 수 없습니다.");

  // session.ts submitAnswer와 같은 이유로 멱등 처리(중복 클릭 등).
  const { data: existingAttempt } = await db
    .from("question_attempts")
    .select("is_correct")
    .eq("session_id", sessionId)
    .eq("problem_id", problem.id)
    .maybeSingle();

  let correct: boolean;
  if (existingAttempt) {
    correct = existingAttempt.is_correct;
  } else {
    const result = gradeAnswer(problem.answer_format as AnswerFormat, problem.answer_spec, submitted);
    correct = result.correct;
    const { error: attemptErr } = await db.from("question_attempts").insert({
      student_id: userId,
      problem_id: problem.id,
      unit_id: problem.unit_id,
      attempt_no: 1,
      is_correct: correct,
      source: "self",
      session_id: sessionId,
    });
    if (attemptErr) throw new Error(`진단 시도 기록 실패: ${attemptErr.message}`);
    if (correct) {
      await db.from("math_sessions").update({ correct_count: session.correct_count + 1 }).eq("id", sessionId);
    }
  }

  const solution = problem.solution_text as string;

  if (currentPosition + 1 >= session.item_count) {
    const placement = await completeDiagnostic(db, userId, session);
    return { correct, solution, done: true, placement };
  }

  const { data: currentUnitRow } = await db.from("curriculum_units").select("curriculum_detail").eq("id", session.unit_id).single();
  if (!currentUnitRow) throw new Error("단원 정보를 찾을 수 없습니다.");
  const units = await loadOrderedUnits(db, currentUnitRow.curriculum_detail as string);
  const sampleIdx = sampleUnitIndices(units.length, session.item_count);
  const nextUnit = units[sampleIdx[currentPosition + 1]];

  const nextDifficulty = correct
    ? Math.min(4, (problem.numeric_difficulty ?? START_DIFFICULTY) + 1)
    : Math.max(1, (problem.numeric_difficulty ?? START_DIFFICULTY) - 1);

  const usedProblemIds = (items ?? []).map((i) => i.problem_id);
  const nextItem = await pickItemForUnit(db, nextUnit.id, nextDifficulty, usedProblemIds, correct);
  if (!nextItem) {
    // 이 단원에 쓸 문항이 없으면(문항 부족) 진단을 여기서 조기 종료한다 — 있는 만큼만 본다.
    const placement = await completeDiagnostic(db, userId, { ...session, item_count: currentPosition + 1 });
    return { correct, solution, done: true, placement };
  }

  const { error: itemErr } = await db
    .from("math_session_items")
    .insert({ session_id: sessionId, position: currentPosition + 1, problem_id: nextItem.id });
  if (itemErr) throw new Error(`다음 진단 문항 저장 실패: ${itemErr.message}`);

  return {
    correct,
    solution,
    done: false,
    next: { position: currentPosition + 1, total: session.item_count, item: toItemView(nextItem) },
  };
}

export async function skipDiagnostic(userId: string, curriculumDetail: string): Promise<PlacementResult> {
  const db = serviceClient();
  const units = await loadOrderedUnits(db, curriculumDetail);
  if (units.length === 0) throw new Error("커리큘럼 단원을 찾을 수 없습니다.");
  const firstUnit = units[0];

  await db.from("math_placements").upsert(
    {
      user_id: userId,
      curriculum_group: firstUnit.curriculum_group,
      curriculum_detail: curriculumDetail,
      exempted_unit_ids: [],
      completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  return { startUnitId: firstUnit.id, startUnitName: firstUnit.unit_name, exemptedCount: 0 };
}
