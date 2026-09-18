/**
 * RUN_MATH_SITE.md 5단계 추가 A — 시작 과정 2개 자동 생성.
 *
 * 1) 자동채점 가능+검수완료 문항이 8개 이상인 단원마다 초안 문제지 1장(문항 8개, 난이도
 *    고르게)을 만든다. 이미 그 unit_id로 만든 문제지가 있으면 그걸 그대로 쓴다(중복 생성 안 함).
 * 2) "IGCSE 기본"(IGCSE 단원)·"KR 기본"(KR 단원) 과정 2개를 만들고, math_track_worksheets에
 *    curriculum_units.sort_order 순서로 연결한다.
 * 3) 기존 학생에게 과정을 자동 배정하지 않는다 — profiles.track_id/math_track_progress는
 *    이 스크립트가 절대 건드리지 않는다(배정은 관리 화면에서 사람이 한다).
 *
 * 기본은 dry-run(생성 예정 수만 출력, DB 안 건드림). --apply 플래그가 있어야 실제 반영.
 *
 * 사용법:
 *   npx tsx scripts/seed-tracks.ts            (dry-run)
 *   npx tsx scripts/seed-tracks.ts --apply     (실제 반영)
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

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

const ITEMS_PER_WORKSHEET = 8;
const MIN_ITEMS_PER_UNIT = 8;
const TRACK_GROUPS = ["IGCSE", "KR"] as const;

interface ProblemRow {
  id: string;
  unit_id: string;
  difficulty: string;
}

interface UnitRow {
  id: string;
  curriculum_group: string;
  curriculum_detail: string;
  unit_name: string;
  sort_order: number;
}

async function fetchAllGradableProblems(db: SupabaseClient): Promise<ProblemRow[]> {
  const pageSize = 1000;
  const all: ProblemRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("problems")
      .select("id, unit_id, difficulty")
      .eq("subject", "math")
      .eq("verified", true)
      .eq("is_auto_gradable", true)
      .not("unit_id", "is", null)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as ProblemRow[]));
    if (data.length < pageSize) break;
  }
  return all;
}

// 난이도 고르게 — 하/중/상 풀을 만들어 라운드로빈으로 최대 8개 뽑는다. 특정 난이도가 없으면
// 있는 것만으로 채운다(억지로 균등 분배하지 않음).
function pickBalanced(problems: ProblemRow[], count: number): ProblemRow[] {
  const buckets: Record<string, ProblemRow[]> = {};
  for (const p of problems) {
    (buckets[p.difficulty] ??= []).push(p);
  }
  const keys = Object.keys(buckets);
  const picked: ProblemRow[] = [];
  let i = 0;
  while (picked.length < count && keys.some((k) => buckets[k].length > 0)) {
    const key = keys[i % keys.length];
    const bucket = buckets[key];
    if (bucket.length > 0) picked.push(bucket.shift()!);
    i++;
  }
  return picked;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = serviceClient();

  const gradableProblems = await fetchAllGradableProblems(db);
  const byUnit = new Map<string, ProblemRow[]>();
  for (const p of gradableProblems) {
    if (!byUnit.has(p.unit_id)) byUnit.set(p.unit_id, []);
    byUnit.get(p.unit_id)!.push(p);
  }
  const qualifyingUnitIds = [...byUnit.entries()].filter(([, ps]) => ps.length >= MIN_ITEMS_PER_UNIT).map(([id]) => id);

  const { data: unitsData, error: unitsErr } = await db
    .from("curriculum_units")
    .select("id, curriculum_group, curriculum_detail, unit_name, sort_order")
    .in("id", qualifyingUnitIds);
  if (unitsErr) throw new Error(unitsErr.message);
  const units = (unitsData ?? []) as UnitRow[];

  const { data: existingWorksheets } = await db
    .from("worksheets")
    .select("id, unit_id")
    .eq("subject", "math")
    .not("unit_id", "is", null);
  const worksheetByUnit = new Map<string, string>();
  for (const w of existingWorksheets ?? []) {
    if (!worksheetByUnit.has(w.unit_id)) worksheetByUnit.set(w.unit_id, w.id);
  }

  const toCreate = units.filter((u) => !worksheetByUnit.has(u.id));
  const toReuse = units.filter((u) => worksheetByUnit.has(u.id));

  console.log(`8개 이상 문항 보유 단원: ${units.length}개`);
  console.log(`  문제지 새로 생성: ${toCreate.length}개 · 기존 문제지 재사용: ${toReuse.length}개`);

  for (const group of TRACK_GROUPS) {
    const count = units.filter((u) => u.curriculum_group === group).length;
    console.log(`  ${group} 단원: ${count}개 → "${group === "IGCSE" ? "IGCSE 기본" : "KR 기본"}" 과정 문제지 ${count}장`);
  }

  if (!apply) {
    console.log("\n--apply 가 없어 dry-run으로 끝냅니다(DB 변경 없음).");
    return;
  }

  console.log("\n실제 반영 중…");
  const unitIdToWorksheetId = new Map<string, string>(worksheetByUnit);

  for (const unit of toCreate) {
    const { data: ws, error: wsErr } = await db
      .from("worksheets")
      .insert({ title: `${unit.unit_name} 기본`, subject: "math", unit_id: unit.id })
      .select("id")
      .single();
    if (wsErr || !ws) {
      console.error(`  문제지 생성 실패(단원 ${unit.unit_name}): ${wsErr?.message}`);
      continue;
    }
    const picked = pickBalanced(byUnit.get(unit.id) ?? [], ITEMS_PER_WORKSHEET);
    const rows = picked.map((p, i) => ({ worksheet_id: ws.id, problem_id: p.id, position: i }));
    const { error: wpErr } = await db.from("worksheet_problems").insert(rows);
    if (wpErr) {
      console.error(`  worksheet_problems 삽입 실패(단원 ${unit.unit_name}): ${wpErr.message}`);
      continue;
    }
    unitIdToWorksheetId.set(unit.id, ws.id);
    console.log(`  생성: [${unit.unit_name} 기본] 문항 ${picked.length}개`);
  }
  for (const unit of toReuse) {
    console.log(`  재사용: [${unit.unit_name}] → 기존 문제지 ${worksheetByUnit.get(unit.id)}`);
  }

  for (const group of TRACK_GROUPS) {
    const trackName = group === "IGCSE" ? "IGCSE 기본" : "KR 기본";
    const groupUnits = units.filter((u) => u.curriculum_group === group).sort((a, b) => a.sort_order - b.sort_order);

    const { data: existingTrack } = await db.from("math_tracks").select("id").eq("name", trackName).maybeSingle();
    let trackId = existingTrack?.id as string | undefined;
    if (!trackId) {
      const { data: newTrack, error: trackErr } = await db
        .from("math_tracks")
        .insert({ name: trackName, curriculum_group: group })
        .select("id")
        .single();
      if (trackErr || !newTrack) {
        console.error(`과정 생성 실패(${trackName}): ${trackErr?.message}`);
        continue;
      }
      trackId = newTrack.id;
    }

    // 기존 순서를 지우고 다시 채운다 — position 유니크 제약과 부딪히지 않게, 이 과정의 연결만 삭제.
    await db.from("math_track_worksheets").delete().eq("track_id", trackId);
    const rows = groupUnits
      .map((u) => unitIdToWorksheetId.get(u.id))
      .filter((id): id is string => !!id)
      .map((worksheetId, i) => ({ track_id: trackId, worksheet_id: worksheetId, position: i + 1 }));
    if (rows.length > 0) {
      const { error: mtwErr } = await db.from("math_track_worksheets").insert(rows);
      if (mtwErr) console.error(`과정 연결 실패(${trackName}): ${mtwErr.message}`);
    }
    console.log(`과정 "${trackName}": 문제지 ${rows.length}장 연결 (track_id=${trackId})`);
  }

  console.log("\n반영 완료. profiles.track_id/math_track_progress는 건드리지 않았습니다(수동 배정 대기).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
