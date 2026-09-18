/**
 * RUN_MATH_SITE.md 6단계 B — 콘텐츠 결함 스캔(수정 아님, 목록만).
 *
 * verified=true AND is_auto_gradable=true 전체 문항을 src/lib/math/problem-defects.ts의
 * detectDefects()로 검사한다(API 라우트 /api/study/problem-defects와 같은 기준 재사용).
 *
 * 사용법: npx tsx scripts/scan-problems.ts
 * 결과: scripts/out/problem-defects.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { detectDefects, type ScannableProblem } from "../src/lib/math/problem-defects";

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

interface ProblemRow extends ScannableProblem {
  unit: string | null;
  curriculum_detail: string | null;
  unit_id: string | null;
}

async function fetchAllScannable(db: SupabaseClient): Promise<ProblemRow[]> {
  const pageSize = 1000;
  const all: ProblemRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("problems")
      .select("id, content_text, image_url, solution_text, choices, answer_format, answer_spec, unit, curriculum_detail, unit_id")
      .eq("subject", "math")
      .eq("verified", true)
      .eq("is_auto_gradable", true)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as ProblemRow[]));
    if (data.length < pageSize) break;
  }
  return all;
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

async function main() {
  const db = serviceClient();
  const problems = await fetchAllScannable(db);
  console.log(`검사 대상: ${problems.length}건`);

  const { data: unitRows } = await db.from("curriculum_units").select("id, unit_name");
  const unitNameById = new Map((unitRows ?? []).map((u) => [u.id, u.unit_name]));

  const rows: { problem_id: string; unit: string; defect_type: string; detail: string; snippet: string }[] = [];
  const countByType: Record<string, number> = {};

  for (const p of problems) {
    const findings = detectDefects(p);
    if (findings.length === 0) continue;
    const unitLabel = (p.unit_id && unitNameById.get(p.unit_id)) || p.unit || p.curriculum_detail || "-";
    const snippet = (p.content_text ?? "").replace(/\s+/g, " ").slice(0, 60);
    for (const f of findings) {
      countByType[f.type] = (countByType[f.type] ?? 0) + 1;
      rows.push({ problem_id: p.id, unit: unitLabel, defect_type: f.type, detail: f.detail, snippet });
    }
  }

  console.log("\n유형별 건수:");
  for (const [type, count] of Object.entries(countByType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}건`);
  }
  console.log(`\n결함이 있는 문항(중복 제거): ${new Set(rows.map((r) => r.problem_id)).size}건 / 전체 ${problems.length}건`);

  mkdirSync("scripts/out", { recursive: true });
  const header = "problem_id,unit,defect_type,detail,snippet\n";
  const body = rows
    .map((r) => [r.problem_id, csvEscape(r.unit), r.defect_type, csvEscape(r.detail), csvEscape(r.snippet)].join(","))
    .join("\n");
  writeFileSync("scripts/out/problem-defects.csv", header + body + (body ? "\n" : ""), "utf8");
  console.log(`\n저장: scripts/out/problem-defects.csv (${rows.length}행)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
