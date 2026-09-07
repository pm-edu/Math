/**
 * 수학 학습 진행 구조 PG-A: 문항 백필 (RUN_MATH_PROGRESSION.md A-3).
 *
 * 1) curriculum_group+curriculum_detail+unit으로 curriculum_units를 정확 일치 조회해
 *    problems.unit_id를 채운다. 유사도 매칭·추측 금지 — 실패 건은 CSV로만 남긴다.
 * 2) answer 형태로 answer_format을 분류한다: 정수/소수/분수 -> numeric(+is_auto_gradable=true),
 *    그 외 -> free. (지시서 A-3 범위 그대로 — mcq 자동판별은 여기서 안 함, 아래 요약에 별도 보고)
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

function classifyAnswer(raw: string | null): { format: "numeric" | "free"; autoGradable: boolean } {
  const a = (raw ?? "").trim();
  const isNumeric = /^-?\d+$/.test(a) || /^-?\d+\.\d+$/.test(a) || /^-?\d+\/\d+$/.test(a);
  return { format: isNumeric ? "numeric" : "free", autoGradable: isNumeric };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = serviceClient();

  const { data: problems, error: pErr } = await db
    .from("problems")
    .select("id, answer, curriculum_group, curriculum_detail, unit, verified")
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
  let numericCount = 0;
  let freeCount = 0;
  let mcqLikeInFree = 0; // free로 분류됐지만 답이 단일 알파벳이라 사실 mcq로 보이는 것(보고만, 변환은 안 함)
  const unmatchedRows: { problem_id: string; curriculum_group: string | null; curriculum_detail: string | null; unit: string | null; verified: boolean }[] = [];
  const unitIdByProblemId = new Map<string, string>();
  const formatByProblemId = new Map<string, { format: "numeric" | "free"; autoGradable: boolean }>();

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

    const classified = classifyAnswer(p.answer);
    formatByProblemId.set(p.id, classified);
    if (classified.format === "numeric") numericCount++;
    else {
      freeCount++;
      if (/^[A-Ea-e]$/.test((p.answer ?? "").trim())) mcqLikeInFree++;
    }
  }

  console.log(`총 ${problems.length}건 · unit_id 매칭 ${matched}건 · 미매칭 ${unmatchedRows.length}건`);
  console.log(`answer_format 분류 — numeric(자동채점): ${numericCount} · free: ${freeCount}`);
  console.log(`  (참고: free 중 답이 단일 알파벳 A~E라 실제로는 mcq로 보이는 것 ${mcqLikeInFree}건 — 이번 A-3 범위 밖이라 free로 남겨둠, 지시서에 mcq 자동판별 언급 없음)`);

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
      .update({ unit_id: unitId, answer_format: fmt.format, is_auto_gradable: fmt.autoGradable })
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
