/**
 * 수학 학습 진행 구조 PG0: 시드 스크립트 (RUN_MATH_PROGRESSION.md 0-5).재실행해도 안전(idempotent).
 *
 * 1) curriculum_units에서 IGCSE_0607 unit들을 sort_order 순으로 선형 선수관계
 *    (math_unit_prereqs: unit[n] requires unit[n-1]) 생성.
 * 2) 테스트 계정 6개 생성(이미 있으면 재사용) + 각 계정의 진행 상태 시드.
 *    PG0 범위 밖(세션/뷰/UI/FSRS 계산 로직)은 만들지 않는다 — 지시서 0-7 그대로,
 *    여기서는 각 계정이 "그 상태처럼 보이도록" 로우 데이터만 심는다.
 *
 * 사용법: npx tsx scripts/seed-math-progression.ts
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal();

const CURRICULUM_DETAIL = "IGCSE_0607";
const TEST_PASSWORD = "Test-Math-2026!"; // 내부 QA/RLS 검증 전용 — 실제 서비스 계정 아님.
const TEST_EMAIL_DOMAIN = "test.pmedu4u.internal"; // 존재하지 않는 도메인 — 발송 안 됨, email_confirm으로 즉시 활성화.

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface UnitRow {
  id: string;
  unit_name: string;
  sort_order: number;
}

async function ensureTestUser(db: SupabaseClient, localPart: string, name: string): Promise<string> {
  const email = `${localPart}@${TEST_EMAIL_DOMAIN}`;
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`listUsers 실패: ${listErr.message}`);
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created.user) throw new Error(`createUser 실패(${email}): ${createErr?.message}`);
  return created.user.id;
}

async function seedPrereqs(db: SupabaseClient, units: UnitRow[]) {
  const rows = units.slice(1).map((u, i) => ({ unit_id: u.id, requires_unit_id: units[i].id }));
  if (rows.length === 0) return;
  const { error } = await db.from("math_unit_prereqs").upsert(rows, { onConflict: "unit_id,requires_unit_id", ignoreDuplicates: true });
  if (error) throw new Error(`math_unit_prereqs 시드 실패: ${error.message}`);
  console.log(`  math_unit_prereqs: ${rows.length}건 (선형 체인, unit[n] requires unit[n-1])`);
}

const MASTERED_BASE = {
  mastery_score: 0.9,
  first_try_accuracy: 0.875,
  items_attempted: 8,
  fsrs_stability: 5,
  fsrs_difficulty: 5,
  fsrs_reps: 1,
  fsrs_lapses: 0,
};

async function upsertUnitState(
  db: SupabaseClient,
  userId: string,
  unitId: string,
  overrides: Record<string, unknown>
) {
  const { error } = await db
    .from("math_unit_states")
    .upsert({ user_id: userId, unit_id: unitId, ...overrides }, { onConflict: "user_id,unit_id" });
  if (error) throw new Error(`math_unit_states 시드 실패(user=${userId}, unit=${unitId}): ${error.message}`);
}

async function main() {
  const db = serviceClient();

  const { data: units, error: unitsErr } = await db
    .from("curriculum_units")
    .select("id, unit_name, sort_order")
    .eq("curriculum_detail", CURRICULUM_DETAIL)
    .not("unit_name", "ilike", "%코스워크%")
    .order("sort_order");
  if (unitsErr || !units || units.length === 0) {
    console.error("단원 조회 실패:", unitsErr?.message ?? "(0건)");
    process.exit(1);
  }
  const unitList = units as UnitRow[];
  console.log(`curriculum_units(${CURRICULUM_DETAIL}) ${unitList.length}개 로드`);

  console.log("\n[1/2] 선수관계 시드");
  await seedPrereqs(db, unitList);

  console.log("\n[2/2] 테스트 계정 6개");
  const now = Date.now();
  const past = (days: number) => new Date(now - days * 86_400_000).toISOString();
  const future = (days: number) => new Date(now + days * 86_400_000).toISOString();

  // test-new@ — placement 없음, 초기 상태. 계정만 만들고 아무 상태도 심지 않는다.
  const newUserId = await ensureTestUser(db, "test-new", "테스트-신규");
  console.log(`  test-new: ${newUserId} (상태 없음)`);

  // test-progress@ — mastered 3, in_progress 1
  const progressUserId = await ensureTestUser(db, "test-progress", "테스트-진행중");
  for (let i = 0; i < 3; i++) {
    await upsertUnitState(db, progressUserId, unitList[i].id, {
      status: "mastered",
      ...MASTERED_BASE,
      last_practiced_at: past(3),
      next_review_at: future(14),
    });
  }
  await upsertUnitState(db, progressUserId, unitList[3].id, {
    status: "in_progress",
    first_try_accuracy: 0.5,
    items_attempted: 4,
    last_practiced_at: past(1),
  });
  console.log(`  test-progress: ${progressUserId} (mastered ${unitList[0].unit_name}/${unitList[1].unit_name}/${unitList[2].unit_name}, in_progress ${unitList[3].unit_name})`);

  // test-review@ — mastered 2, 그중 1개 next_review_at 과거
  const reviewUserId = await ensureTestUser(db, "test-review", "테스트-복습");
  await upsertUnitState(db, reviewUserId, unitList[0].id, {
    status: "mastered",
    ...MASTERED_BASE,
    last_practiced_at: past(20),
    next_review_at: past(2), // 과거 — 복습 도래
  });
  await upsertUnitState(db, reviewUserId, unitList[1].id, {
    status: "mastered",
    ...MASTERED_BASE,
    last_practiced_at: past(5),
    next_review_at: future(9), // 미래 — 아직 도래 안 함
  });
  console.log(`  test-review: ${reviewUserId} (mastered 2, ${unitList[0].unit_name} next_review_at 과거)`);

  // test-done@ — 전 unit mastered
  const doneUserId = await ensureTestUser(db, "test-done", "테스트-완주");
  for (const u of unitList) {
    await upsertUnitState(db, doneUserId, u.id, {
      status: "mastered",
      ...MASTERED_BASE,
      last_practiced_at: past(1),
      next_review_at: future(30),
    });
  }
  console.log(`  test-done: ${doneUserId} (전체 ${unitList.length}개 단원 mastered)`);

  // test-stuck@ — consecutive_failed_sessions = 3
  const stuckUserId = await ensureTestUser(db, "test-stuck", "테스트-정체");
  await upsertUnitState(db, stuckUserId, unitList[0].id, {
    status: "in_progress",
    first_try_accuracy: 0.3,
    items_attempted: 24,
    consecutive_failed_sessions: 3,
    last_practiced_at: past(1),
  });
  console.log(`  test-stuck: ${stuckUserId} (${unitList[0].unit_name} consecutive_failed_sessions=3)`);

  // test-lesson@ — source='lesson' 시도만 존재 (능력 통계에서 제외돼야 함)
  const lessonUserId = await ensureTestUser(db, "test-lesson", "테스트-수업");
  const { data: lessonProblem, error: lessonProblemErr } = await db
    .from("problems")
    .select("id, difficulty")
    .eq("unit_id", unitList[0].id)
    .eq("verified", true)
    .limit(1)
    .maybeSingle();
  if (lessonProblemErr || !lessonProblem) {
    console.error(`  test-lesson: 시드용 문항을 찾지 못함(unit=${unitList[0].unit_name}) — ${lessonProblemErr?.message ?? "0건"}`);
  } else {
    const { data: existingLessonAttempt } = await db
      .from("question_attempts")
      .select("id")
      .eq("student_id", lessonUserId)
      .eq("source", "lesson")
      .limit(1)
      .maybeSingle();
    if (!existingLessonAttempt) {
      const { error: insErr } = await db.from("question_attempts").insert({
        student_id: lessonUserId,
        problem_id: lessonProblem.id,
        unit_id: unitList[0].id,
        difficulty: lessonProblem.difficulty,
        attempt_no: 1,
        is_correct: true,
        elapsed_seconds: 45,
        source: "lesson",
      });
      if (insErr) throw new Error(`test-lesson question_attempts 삽입 실패: ${insErr.message}`);
    }
    console.log(`  test-lesson: ${lessonUserId} (source='lesson' 시도 1건, unit=${unitList[0].unit_name})`);
  }

  console.log("\n완료. 테스트 계정 비밀번호(공용, QA 전용):", TEST_PASSWORD);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
