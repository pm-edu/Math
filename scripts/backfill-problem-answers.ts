/**
 * 수학 학습 진행 구조 PG-A: 문항 백필 (RUN_MATH_PROGRESSION.md A-3).
 *
 * 1) curriculum_group+curriculum_detail+unit으로 curriculum_units를 정확 일치 조회해
 *    problems.unit_id를 채운다. 유사도 매칭·추측 금지 — 실패 건은 CSV로만 남긴다.
 * 2) answer_format을 분류한다: choices 배열이 있으면 mcq(+is_auto_gradable=true,
 *    answer_spec={choices, correct_index}), 정수/소수/분수면 numeric(+is_auto_gradable=true,
 *    answer_spec={value, tolerance:0, accept:[]}), 그 외 free.
 *    (2026-09-07 게이트3 재확인 중 발견해 수정: 원래 A-3 실행 때는 mcq 자동판별을 빼먹어서
 *    mcq 문항(답이 A~D 글자)이 전부 free/is_auto_gradable=false로 잘못 들어갔었다 — 자동채점
 *    비율·세션 구성 가능 단원 수 계산에 실제로 영향을 주므로 여기서 정정하고 전체 재반영한다.)
 *
 * 기본은 dry-run(집계만 출력, DB 안 건드림). --apply 플래그가 있어야 실제 UPDATE.
 *
 * 사용법:
 *   npx tsx scripts/backfill-problem-answers.ts            (dry-run)
 *   npx tsx scripts/backfill-problem-answers.ts --apply     (실제 반영)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

interface ProblemRow {
  id: string;
  answer: string | null;
  choices: string[] | null;
  curriculum_group: string | null;
  curriculum_detail: string | null;
  unit: string | null;
  verified: boolean;
}

interface UnitRow {
  id: string;
  curriculum_group: string;
  curriculum_detail: string;
  unit_name: string;
}

const LETTERS = ["A", "B", "C", "D"] as const;

function classifyAnswer(
  raw: string | null,
  choices: string[] | null
): { format: "mcq" | "numeric" | "free"; autoGradable: boolean; spec: Record<string, unknown> | null } {
  const a = (raw ?? "").trim();
  if (choices && choices.length > 0) {
    const correctIndex = LETTERS.indexOf(a as (typeof LETTERS)[number]);
    if (correctIndex >= 0) {
      return { format: "mcq", autoGradable: true, spec: { choices, correct_index: correctIndex } };
    }
  }
  const isNumeric = /^-?\d+$/.test(a) || /^-?\d+\.\d+$/.test(a) || /^-?\d+\/\d+$/.test(a);
  if (isNumeric) {
    return { format: "numeric", autoGradable: true, spec: { value: a, tolerance: 0, accept: [] } };
  }
  return { format: "free", autoGradable: false, spec: null };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = serviceClient();

  const { data: problems, error: pErr } = await db
    .from("problems")
    .select("id, answer, choices, curriculum_group, curriculum_detail, unit, verified")
    .eq("subject", "math");
  if (pErr || !problems) {
    console.error("problems 조회 실패:", pErr?.message);
    process.exit(1);
  }

  const { data: units, error: uErr } = await db
    .from("curriculum_units")
    .select("id, curriculum_group, curriculum_detail, unit_name");
  if (uErr || !units) {
    console.error("curriculum_units 조회 실패:", uErr?.message);
    process.exit(1);
  }

  const unitMap = new Map<string, string>();
  for (const u of units as UnitRow[]) {
    unitMap.set(`${u.curriculum_group}||${u.curriculum_detail}||${u.unit_name}`, u.id);
  }

  let matched = 0;
  let mcqCount = 0;
  let numericCount = 0;
  let freeCount = 0;
  const unmatchedRows: { problem_id: string; curriculum_group: string | null; curriculum_detail: string | null; unit: string | null; verified: boolean }[] = [];
  const unitIdByProblemId = new Map<string, string>();
  const formatByProblemId = new Map<string, ReturnType<typeof classifyAnswer>>();

  for (const p of problems as ProblemRow[]) {
    const key = `${p.curriculum_group}||${p.curriculum_detail}||${p.unit}`;
    const unitId = unitMap.get(key);
    if (unitId) {
      matched++;
      unitIdByProblemId.set(p.id, unitId);
    } else {
      unmatchedRows.push({
        problem_id: p.id,
        curriculum_group: p.curriculum_group,
        curriculum_detail: p.curriculum_detail,
        unit: p.unit,
        verified: p.verified,
      });
    }

    const classified = classifyAnswer(p.answer, p.choices);
    formatByProblemId.set(p.id, classified);
    if (classified.format === "mcq") mcqCount++;
    else if (classified.format === "numeric") numericCount++;
    else freeCount++;
  }

  console.log(`총 ${problems.length}건 · unit_id 매칭 ${matched}건 · 미매칭 ${unmatchedRows.length}건`);
  console.log(`answer_format 분류 — mcq(자동채점): ${mcqCount} · numeric(자동채점): ${numericCount} · free: ${freeCount}`);

  mkdirSync("scripts/out", { recursive: true });
  const csvHeader = "problem_id,curriculum_group,curriculum_detail,unit,verified\n";
  const csvBody = unmatchedRows
    .map((r) => `${r.problem_id},"${r.curriculum_group ?? ""}","${r.curriculum_detail ?? ""}","${r.unit ?? ""}",${r.verified}`)
    .join("\n");
  writeFileSync("scripts/out/unmatched-units.csv", csvHeader + csvBody + (csvBody ? "\n" : ""), "utf8");
  console.log(`미매칭 목록 저장: scripts/out/unmatched-units.csv (${unmatchedRows.length}건)`);

  // 전환 후(=매칭+자동채점) 단원당 중앙값 미리보기
  const perUnit: Record<string, number> = {};
  for (const p of problems as ProblemRow[]) {
    const unitId = unitIdByProblemId.get(p.id);
    const fmt = formatByProblemId.get(p.id)!;
    if (unitId && fmt.autoGradable && p.verified) {
      perUnit[unitId] = (perUnit[unitId] ?? 0) + 1;
    }
  }
  const counts = Object.values(perUnit).sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  console.log(`전환 후(자동채점+매칭+verified) 단원당 문항 수 — 단원 ${counts.length}개, 중앙값 ${median}`);

  if (!apply) {
    console.log("\n--apply 가 없어 dry-run으로 끝냅니다(DB 변경 없음).");
    return;
  }

  console.log("\n실제 반영 중…");
  let updated = 0;
  for (const p of problems as ProblemRow[]) {
    const unitId = unitIdByProblemId.get(p.id) ?? null;
    const fmt = formatByProblemId.get(p.id)!;
    const { error } = await db
      .from("problems")
      .update({ unit_id: unitId, answer_format: fmt.format, is_auto_gradable: fmt.autoGradable, answer_spec: fmt.spec })
      .eq("id", p.id);
    if (error) {
      console.error(`  업데이트 실패(id=${p.id}):`, error.message);
      continue;
    }
    updated++;
  }
  console.log(`반영 완료: ${updated}/${problems.length}건`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
