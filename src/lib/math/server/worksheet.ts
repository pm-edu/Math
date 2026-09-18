// RUN_MATH_SITE.md 4-5: 문제지 풀이 서버 로직. service role 사용 — RLS를 우회하니 반드시
// 서버(API 라우트)에서만 호출한다. src/lib/math/server/session.ts(수학 학습 진행 구조 PG1)와
// 같은 구조를 그대로 따른다: 채점은 gradeAnswer(순수 함수)로만 하고, answer_spec은 절대
// 클라이언트로 내려주지 않는다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gradeAnswer, type AnswerFormat } from "@/lib/math/grading";

const PASS_ACCURACY = 0.8; // RUN_MATH_SITE.md 1단계: "문제지 정답률 80% 이상이면 다음 문제지 열림"

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export interface WorksheetItemView {
  position: number;
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: AnswerFormat;
  choices: string[];
  difficulty: string;
}

interface GradableProblemRow {
  id: string;
  position: number;
  content_text: string;
  image_url: string;
  answer_format: AnswerFormat;
  choices: string[] | null;
  difficulty: string;
}

// 문제지에 딸린 문항 중 자동채점 가능한 것만 서빙한다 — 서술형 등 나머지는 4단계 전역 금지사항
// (학습 실행 경로에 LLM 호출 금지, 채점 파이프라인은 이번 단계에 없음)에 걸려 아직 못 다룬다.
async function loadGradableProblems(db: SupabaseClient, worksheetId: string): Promise<GradableProblemRow[]> {
  const { data, error } = await db
    .from("worksheet_problems")
    .select("position, problems(id, content_text, image_url, answer_format, choices, difficulty, verified, is_auto_gradable)")
    .eq("worksheet_id", worksheetId)
    .order("position");
  if (error) throw new Error(`문제지 문항 조회 실패: ${error.message}`);

  type JoinedRow = {
    position: number;
    problems: {
      id: string;
      content_text: string;
      image_url: string;
      answer_format: AnswerFormat;
      choices: string[] | null;
      difficulty: string;
      verified: boolean;
      is_auto_gradable: boolean;
    } | null;
  };

  return ((data ?? []) as unknown as JoinedRow[])
    .filter((r) => r.problems?.verified && r.problems?.is_auto_gradable)
    .map((r) => ({
      id: r.problems!.id,
      position: r.position,
      content_text: r.problems!.content_text,
      image_url: r.problems!.image_url,
      answer_format: r.problems!.answer_format,
      choices: r.problems!.choices,
      difficulty: r.problems!.difficulty,
    }));
}

function toItemView(p: GradableProblemRow): WorksheetItemView {
  return {
    position: p.position,
    problemId: p.id,
    contentText: p.content_text,
    imageUrl: p.image_url,
    answerFormat: p.answer_format,
    choices: p.choices ?? [],
    difficulty: p.difficulty,
  };
}

// 이 문제지를 풀 자격이 있는지 본다 — 개별/반 배정(v_math_student_assignments, 3단계)이 있으면
// 과정과 무관하게 항상 허용, 아니면 과정 진행(math_track_progress)이 'locked'가 아니어야 한다.
// 둘 다 없으면 거부(과정도 배정도 안 된 문제지를 임의로 못 풀게).
async function assertAccess(db: SupabaseClient, userId: string, worksheetId: string): Promise<void> {
  const { data: assignment } = await db
    .from("v_math_student_assignments")
    .select("worksheet_id")
    .eq("user_id", userId)
    .eq("worksheet_id", worksheetId)
    .maybeSingle();
  if (assignment) return;

  const { data: progress } = await db
    .from("math_track_progress")
    .select("status")
    .eq("user_id", userId)
    .eq("worksheet_id", worksheetId)
    .maybeSingle();
  if (progress && progress.status !== "locked") return;

  throw new Error("이 문제지를 풀 권한이 없습니다.");
}

export interface StartWorksheetResult {
  worksheetTitle: string;
  items: WorksheetItemView[];
  answeredProblemIds: string[];
}

export async function startWorksheet(userId: string, worksheetId: string): Promise<StartWorksheetResult> {
  const db = serviceClient();
  await assertAccess(db, userId, worksheetId);
  const problems = await loadGradableProblems(db, worksheetId);

  const { data: worksheet } = await db.from("worksheets").select("title").eq("id", worksheetId).single();

  // 새로고침 복구(PG3와 같은 원칙) — 이미 답한 문항 id를 같이 내려줘서, 클라이언트가 그걸 빼고
  // 안 푼 것부터 이어서 보여줄 수 있게 한다(로컬스토리지 의존 없이 서버 상태만으로 판단).
  const latest = await loadLatestAttempts(db, userId, worksheetId);

  return {
    worksheetTitle: worksheet?.title ?? "",
    items: problems.map(toItemView),
    answeredProblemIds: [...latest.keys()],
  };
}

export async function submitAnswer(
  userId: string,
  worksheetId: string,
  problemId: string,
  submitted: string,
  elapsedSeconds?: number
): Promise<{ correct: boolean; normalized: string }> {
  const db = serviceClient();
  await assertAccess(db, userId, worksheetId);

  const { data: problem } = await db
    .from("problems")
    .select("id, unit_id, answer_format, answer_spec, difficulty, verified, is_auto_gradable")
    .eq("id", problemId)
    .single();
  if (!problem || !problem.verified || !problem.is_auto_gradable) {
    throw new Error("자동채점 대상 문항이 아닙니다.");
  }

  const { data: belongs } = await db
    .from("worksheet_problems")
    .select("worksheet_id")
    .eq("worksheet_id", worksheetId)
    .eq("problem_id", problemId)
    .maybeSingle();
  if (!belongs) throw new Error("이 문제지에 속한 문항이 아닙니다.");

  const result = gradeAnswer(problem.answer_format as AnswerFormat, problem.answer_spec, submitted);

  const { count: priorAttempts } = await db
    .from("question_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", userId)
    .eq("problem_id", problemId)
    .eq("worksheet_id", worksheetId);

  const { error: attemptErr } = await db.from("question_attempts").insert({
    student_id: userId,
    problem_id: problemId,
    unit_id: problem.unit_id,
    worksheet_id: worksheetId,
    difficulty: problem.difficulty,
    attempt_no: (priorAttempts ?? 0) + 1,
    is_correct: result.correct,
    elapsed_seconds: elapsedSeconds ?? null,
    source: "self",
  });
  if (attemptErr) throw new Error(`시도 기록 실패: ${attemptErr.message}`);

  return { correct: result.correct, normalized: result.normalized };
}

// 문항별 "최신 시도"만 남긴다 — retryWrong으로 같은 문항을 다시 풀면 새 attempt 행이 또 쌓이므로,
// 정답률·오답 목록은 항상 문항당 가장 최근 시도 기준으로 판단해야 한다.
async function loadLatestAttempts(
  db: SupabaseClient,
  userId: string,
  worksheetId: string
): Promise<Map<string, boolean>> {
  const { data } = await db
    .from("question_attempts")
    .select("problem_id, is_correct, created_at")
    .eq("student_id", userId)
    .eq("worksheet_id", worksheetId)
    .order("created_at", { ascending: true });

  const latest = new Map<string, boolean>();
  (data ?? []).forEach((row) => latest.set(row.problem_id, row.is_correct));
  return latest;
}

export interface FinishWorksheetResult {
  worksheetTitle: string;
  accuracy: number;
  passed: boolean;
  unlockedNextWorksheetId: string | null;
}

// 다음 문제지를 연다 — 이 문제지가 사용자의 현재 과정(profiles.track_id)에 속해 있을 때만.
// assign_track() SQL 함수가 과정 지정 시 첫 문제지를 여는 것과 같은 자리에서, 그다음부터는
// 여기(진행 중 통과할 때마다)가 이어서 연다.
async function unlockNextInTrack(db: SupabaseClient, userId: string, worksheetId: string): Promise<string | null> {
  const { data: profile } = await db.from("profiles").select("track_id").eq("id", userId).maybeSingle();
  if (!profile?.track_id) return null;

  const { data: current } = await db
    .from("math_track_worksheets")
    .select("position")
    .eq("track_id", profile.track_id)
    .eq("worksheet_id", worksheetId)
    .maybeSingle();
  if (!current) return null;

  const { data: next } = await db
    .from("math_track_worksheets")
    .select("worksheet_id")
    .eq("track_id", profile.track_id)
    .eq("position", current.position + 1)
    .maybeSingle();
  if (!next) return null;

  await db
    .from("math_track_progress")
    .upsert(
      { user_id: userId, worksheet_id: next.worksheet_id, status: "open" },
      { onConflict: "user_id,worksheet_id" }
    );
  // locked 상태를 되돌려 잠그면 안 되니 이미 passed/open인 경우는 건드리지 않는다.
  await db
    .from("math_track_progress")
    .update({ status: "open" })
    .eq("user_id", userId)
    .eq("worksheet_id", next.worksheet_id)
    .eq("status", "locked");

  return next.worksheet_id;
}

export async function finishWorksheet(userId: string, worksheetId: string): Promise<FinishWorksheetResult> {
  const db = serviceClient();
  await assertAccess(db, userId, worksheetId);

  const problems = await loadGradableProblems(db, worksheetId);
  const latest = await loadLatestAttempts(db, userId, worksheetId);
  const attempted = problems.filter((p) => latest.has(p.id));
  const correctCount = attempted.filter((p) => latest.get(p.id) === true).length;
  const accuracy = problems.length > 0 ? correctCount / problems.length : 0;
  const passed = accuracy >= PASS_ACCURACY;

  const { data: existingProgress } = await db
    .from("math_track_progress")
    .select("attempts, best_accuracy")
    .eq("user_id", userId)
    .eq("worksheet_id", worksheetId)
    .maybeSingle();

  let unlockedNextWorksheetId: string | null = null;

  // 과정에 연결된 문제지일 때만 진행 상태를 갱신한다 — 개별/반 배정 문제지는 진행 개념이 없다.
  if (existingProgress) {
    await db
      .from("math_track_progress")
      .update({
        status: passed ? "passed" : "open",
        best_accuracy: Math.max(accuracy, existingProgress.best_accuracy ?? 0),
        attempts: existingProgress.attempts + 1,
        passed_at: passed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("worksheet_id", worksheetId);

    if (passed) {
      unlockedNextWorksheetId = await unlockNextInTrack(db, userId, worksheetId);
    }
  }

  const { data: worksheet } = await db.from("worksheets").select("title").eq("id", worksheetId).single();
  return { worksheetTitle: worksheet?.title ?? "", accuracy, passed, unlockedNextWorksheetId };
}

// 정답률 80% 미달 시 "틀린 문제만 다시"(RUN_MATH_SITE.md 1단계) — 문항당 최신 시도가 오답이거나
// 아예 시도하지 않은 것만 돌려준다.
export async function retryWrong(userId: string, worksheetId: string): Promise<WorksheetItemView[]> {
  const db = serviceClient();
  await assertAccess(db, userId, worksheetId);

  const problems = await loadGradableProblems(db, worksheetId);
  const latest = await loadLatestAttempts(db, userId, worksheetId);
  const wrongOrUnattempted = problems.filter((p) => latest.get(p.id) !== true);

  return wrongOrUnattempted.map(toItemView);
}
