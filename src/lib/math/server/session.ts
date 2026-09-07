// 수학 학습 진행 구조 PG1: 세션 서버 로직 (RUN_MATH_PROGRESSION.md PG1 1-2). service role 사용 —
// RLS를 우회하니 이 파일의 함수들은 반드시 서버(API 라우트)에서만 호출한다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gradeAnswer, type AnswerFormat } from "@/lib/math/grading";
import { decideNextStep, judgeMastery, type NextStepAction } from "@/lib/math/progression";
import { requireEntitlement } from "@/lib/access/entitlement";

const SESSION_ITEM_COUNT = 8; // D-PG-3
const MASTERY_TARGET_ACCURACY = 0.85; // D-PG-4
const RECENT_EXCLUSION_DAYS = 30;
const FIRST_TRY_WINDOW = 20; // judgeMastery에 넘길 "최근 시도" 창 크기(과거 전체를 다 끌고 오지 않음)
// 지시서 원문의 [1,1,2,2,3,3,4,?]을 그대로 쓴다. 현재 데이터엔 numeric_difficulty=3인 문항이
// 없지만(하=1/중=2/상=4로 매핑, supabase/migrations/202609071400_math_numeric_difficulty.sql
// 참고), pickSessionItems가 없으면 가까운 난이도로 대체하므로 코드에서 3을 미리 빼지 않는다 —
// 나중에 실제 레벨3 문항이 생기면 코드 수정 없이 자동으로 쓰인다.
const BASE_DIFFICULTY_PLAN = [1, 1, 2, 2, 3, 3, 4, 4];

export type SessionKind = "practice" | "review" | "diagnostic" | "lesson";

export interface SessionItemView {
  position: number;
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: AnswerFormat;
  choices: string[];
  difficulty: string;
}

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

interface CandidateProblem {
  id: string;
  content_text: string;
  image_url: string;
  answer_format: AnswerFormat;
  choices: string[];
  difficulty: string;
  numeric_difficulty: number | null;
}

// 난이도 목표 시퀀스에 맞춰 후보 풀에서 중복 없이 뽑는다. 정확히 맞는 난이도가 없으면 가장
// 가까운 난이도로 대체한다(빈 슬롯을 만들지 않는 게 우선) — LLM 호출 없이 은행에서만 뽑는다.
function pickSessionItems(pool: CandidateProblem[], targetPlan: number[]): CandidateProblem[] {
  const remaining = [...pool];
  const picked: CandidateProblem[] = [];
  for (const target of targetPlan) {
    if (remaining.length === 0) break;
    remaining.sort((a, b) => {
      const da = a.numeric_difficulty == null ? 99 : Math.abs(a.numeric_difficulty - target);
      const db = b.numeric_difficulty == null ? 99 : Math.abs(b.numeric_difficulty - target);
      return da - db;
    });
    picked.push(remaining.shift()!);
  }
  return picked;
}

function buildDifficultyPlan(lastSessionAccuracy: number | null): number[] {
  if (lastSessionAccuracy === null) return BASE_DIFFICULTY_PLAN;
  const delta = lastSessionAccuracy >= MASTERY_TARGET_ACCURACY ? 1 : lastSessionAccuracy < 0.5 ? -1 : 0;
  if (delta === 0) return BASE_DIFFICULTY_PLAN;
  return BASE_DIFFICULTY_PLAN.map((d) => Math.min(4, Math.max(1, d + delta)));
}

export async function createSession(
  userId: string,
  unitId: string,
  kind: SessionKind
): Promise<{ sessionId: number; items: SessionItemView[] }> {
  await requireEntitlement(userId, "math.session.start");
  const db = serviceClient();

  const { data: activeSession } = await db
    .from("math_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (activeSession) {
    throw new Error(`이미 진행 중인 세션이 있습니다(session_id=${activeSession.id}). 먼저 완료하거나 종료하세요.`);
  }

  let excludeIds: string[] = [];
  if (kind !== "review") {
    const cutoff = new Date(Date.now() - RECENT_EXCLUSION_DAYS * 86_400_000).toISOString();
    const { data: recent } = await db
      .from("question_attempts")
      .select("problem_id")
      .eq("student_id", userId)
      .eq("unit_id", unitId)
      .gte("created_at", cutoff);
    excludeIds = (recent ?? []).map((r) => r.problem_id);
  }

  let poolQuery = db
    .from("problems")
    .select("id, content_text, image_url, answer_format, choices, difficulty, numeric_difficulty")
    .eq("unit_id", unitId)
    .eq("verified", true)
    .eq("is_auto_gradable", true);
  if (excludeIds.length > 0) poolQuery = poolQuery.not("id", "in", `(${excludeIds.join(",")})`);
  const { data: pool, error: poolErr } = await poolQuery;
  if (poolErr) throw new Error(`문항 조회 실패: ${poolErr.message}`);

  const { data: lastCompleted } = await db
    .from("math_sessions")
    .select("correct_count, item_count")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastAccuracy = lastCompleted && lastCompleted.item_count > 0 ? lastCompleted.correct_count / lastCompleted.item_count : null;

  const plan = buildDifficultyPlan(lastAccuracy).slice(0, SESSION_ITEM_COUNT);
  const selected = pickSessionItems((pool ?? []) as CandidateProblem[], plan);

  const { data: session, error: sessionErr } = await db
    .from("math_sessions")
    .insert({ user_id: userId, unit_id: unitId, kind, item_count: selected.length })
    .select("id")
    .single();
  if (sessionErr || !session) throw new Error(`세션 생성 실패: ${sessionErr?.message}`);

  if (selected.length > 0) {
    const itemRows = selected.map((p, i) => ({ session_id: session.id, position: i, problem_id: p.id }));
    const { error: itemsErr } = await db.from("math_session_items").insert(itemRows);
    if (itemsErr) throw new Error(`세션 문항 저장 실패: ${itemsErr.message}`);
  }

  return {
    sessionId: session.id,
    items: selected.map((p, i) => ({
      position: i,
      problemId: p.id,
      contentText: p.content_text,
      imageUrl: p.image_url,
      answerFormat: p.answer_format,
      choices: p.choices ?? [],
      difficulty: p.difficulty,
    })),
  };
}

export async function submitAnswer(
  userId: string,
  sessionId: number,
  position: number,
  submitted: string,
  elapsedSeconds?: number
): Promise<{ correct: boolean; solution: string }> {
  const db = serviceClient();

  const { data: session } = await db
    .from("math_sessions")
    .select("id, unit_id, correct_count")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (!session) throw new Error("진행 중인 세션이 아닙니다.");

  const { data: item } = await db
    .from("math_session_items")
    .select("problem_id")
    .eq("session_id", sessionId)
    .eq("position", position)
    .maybeSingle();
  if (!item) throw new Error("해당 위치의 문항을 찾을 수 없습니다.");

  const { data: problem } = await db
    .from("problems")
    .select("id, answer_format, answer_spec, solution_text, difficulty")
    .eq("id", item.problem_id)
    .single();
  if (!problem) throw new Error("문항 정보를 찾을 수 없습니다.");

  // 멱등 처리 — 같은 세션의 같은 문항에 이미 채점 기록이 있으면(중복 클릭·네트워크 재시도로
  // 같은 요청이 두 번 온 경우) 새로 채점하지 않고 기존 결과를 그대로 돌려준다. 이게 없으면
  // question_attempts에 같은 위치가 두 번 남고 correct_count도 중복으로 올라간다
  // (2026-09-07 브라우저 실사용 검증 중 실제로 발생시켜 발견).
  const { data: existingAttempt } = await db
    .from("question_attempts")
    .select("is_correct")
    .eq("session_id", sessionId)
    .eq("problem_id", problem.id)
    .maybeSingle();
  if (existingAttempt) {
    return { correct: existingAttempt.is_correct, solution: problem.solution_text };
  }

  const result = gradeAnswer(problem.answer_format as AnswerFormat, problem.answer_spec, submitted);

  const { count: priorAttempts } = await db
    .from("question_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", userId)
    .eq("problem_id", problem.id);

  const { error: attemptErr } = await db.from("question_attempts").insert({
    student_id: userId,
    problem_id: problem.id,
    unit_id: session.unit_id,
    difficulty: problem.difficulty,
    attempt_no: (priorAttempts ?? 0) + 1,
    is_correct: result.correct,
    elapsed_seconds: elapsedSeconds ?? null,
    source: "self",
    session_id: sessionId,
  });
  if (attemptErr) throw new Error(`시도 기록 실패: ${attemptErr.message}`);

  if (result.correct) {
    await db
      .from("math_sessions")
      .update({ correct_count: session.correct_count + 1 })
      .eq("id", sessionId);
  }

  return { correct: result.correct, solution: problem.solution_text };
}

export interface CompleteSessionResult {
  accuracy: number;
  nextStep: { action: NextStepAction; difficultyDelta: number };
  unitState: {
    status: "in_progress" | "mastered";
    masteryScore: number | null;
    firstTryAccuracy: number;
    consecutiveFailedSessions: number;
  };
}

export async function completeSession(userId: string, sessionId: number): Promise<CompleteSessionResult> {
  const db = serviceClient();

  const { data: session } = await db
    .from("math_sessions")
    .select("id, unit_id, item_count, correct_count, kind")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (!session) throw new Error("진행 중인 세션이 아닙니다.");

  const thisSessionAccuracy = session.item_count > 0 ? session.correct_count / session.item_count : 0;

  const { data: firstTryRows } = await db
    .from("question_attempts")
    .select("is_correct, difficulty")
    .eq("student_id", userId)
    .eq("unit_id", session.unit_id)
    .eq("source", "self")
    .eq("attempt_no", 1)
    .order("created_at", { ascending: false })
    .limit(FIRST_TRY_WINDOW);
  const recentFirstTryResults = (firstTryRows ?? []).map((r) => r.is_correct);
  // '상'만 하드 문항으로 본다 — numeric_difficulty 매핑상 3 이상인 값은 지금 데이터엔 '상'(4)뿐.
  const hardItemsCorrect = (firstTryRows ?? []).filter((r) => r.is_correct && r.difficulty === "상").length;

  const { count: priorCompletedCount } = await db
    .from("math_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("unit_id", session.unit_id)
    .eq("status", "completed")
    .neq("kind", "diagnostic");
  const sessionCount = (priorCompletedCount ?? 0) + 1; // 지금 완료하는 이 세션까지 포함

  const mastery = judgeMastery({
    recentFirstTryResults,
    sessionCount,
    hardItemsCorrect,
    targetAccuracy: MASTERY_TARGET_ACCURACY,
    minItems: SESSION_ITEM_COUNT,
  });

  const { data: existingState } = await db
    .from("math_unit_states")
    .select("consecutive_failed_sessions")
    .eq("user_id", userId)
    .eq("unit_id", session.unit_id)
    .maybeSingle();
  const previousFailStreak = existingState?.consecutive_failed_sessions ?? 0;
  const newConsecutiveFailed = thisSessionAccuracy >= MASTERY_TARGET_ACCURACY ? 0 : previousFailStreak + 1;

  const nextStep = mastery.mastered
    ? { action: "master" as NextStepAction, difficultyDelta: 0 }
    : decideNextStep({ accuracy: thisSessionAccuracy, consecutiveFailedSessions: newConsecutiveFailed });

  const newStatus = mastery.mastered ? "mastered" : "in_progress";

  const { error: rpcErr } = await db.rpc("math_apply_session_completion", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_unit_id: session.unit_id,
    p_status: newStatus,
    p_mastery_score: mastery.mastered ? mastery.accuracy : null,
    p_first_try_accuracy: mastery.accuracy,
    p_items_attempted: recentFirstTryResults.length,
    p_consecutive_failed_sessions: newConsecutiveFailed,
    p_activity_date: todayIsoDate(),
    p_item_count: session.item_count,
  });
  if (rpcErr) throw new Error(`세션 완료 반영 실패: ${rpcErr.message}`);

  return {
    accuracy: thisSessionAccuracy,
    nextStep,
    unitState: {
      status: newStatus,
      masteryScore: mastery.mastered ? mastery.accuracy : null,
      firstTryAccuracy: mastery.accuracy,
      consecutiveFailedSessions: newConsecutiveFailed,
    },
  };
}

export interface ActiveSession {
  sessionId: number;
  items: SessionItemView[];
  answeredCount: number;
}

// PG3 새로고침 복구용 — math_sessions.status='in_progress'인 세션이 있으면 문항 목록과
// 이미 답한 개수를 돌려준다(로컬스토리지에 의존하지 않고 서버 상태만 본다).
export async function getActiveSession(userId: string, unitId: string): Promise<ActiveSession | null> {
  const db = serviceClient();

  const { data: session } = await db
    .from("math_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (!session) return null;

  const { data: itemRows } = await db
    .from("math_session_items")
    .select("position, problem_id, problems(content_text, image_url, answer_format, choices, difficulty)")
    .eq("session_id", session.id)
    .order("position");

  const { count: answeredCount } = await db
    .from("question_attempts")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);

  type JoinedRow = {
    position: number;
    problem_id: string;
    problems: { content_text: string; image_url: string; answer_format: AnswerFormat; choices: string[] | null; difficulty: string } | null;
  };

  return {
    sessionId: session.id,
    answeredCount: answeredCount ?? 0,
    items: ((itemRows ?? []) as unknown as JoinedRow[]).map((r) => ({
      position: r.position,
      problemId: r.problem_id,
      contentText: r.problems?.content_text ?? "",
      imageUrl: r.problems?.image_url ?? "",
      answerFormat: r.problems?.answer_format ?? "numeric",
      choices: r.problems?.choices ?? [],
      difficulty: r.problems?.difficulty ?? "",
    })),
  };
}

export async function abandonSession(userId: string, sessionId: number): Promise<void> {
  const db = serviceClient();
  const { error } = await db
    .from("math_sessions")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "in_progress");
  if (error) throw new Error(`세션 종료 실패: ${error.message}`);
}
