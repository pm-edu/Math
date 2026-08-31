/**
 * TOEFL 세트 자동조립 — 블루프린트 기준으로 모듈마다 task_mix만큼, 가장 안 쓰인(least-used)
 * 문항부터 골라 "세트" 하나로 고정 저장한다. 문항 파이프라인 지시서 Phase 5,
 * [[toefl-item-pipeline-project]] 참고. Phase 1 마이그레이션(202608281400)이 만들어둔
 * toefl_item.usage_count/last_used_at를 여기서 처음 실사용한다.
 *
 * 응시 화면(resolveModuleItemIds)의 "응시 시점 무작위 추출"은 이 스크립트와 무관하게 계속
 * 그대로 동작한다 — 이건 그 위에 얹는 별도 도구(관리자가 미리보기/내보내기용으로 세트 하나를
 * 고정해두고 싶을 때)다.
 *
 * 안전장치: --confirm 없이는 DB에 쓰지 않는다(대상 세트 미리보기만 출력). 이미 쓰인 적
 * 있는(usage_count 낮은 순) 문항을 우선 고르고, 고른 문항은 usage_count+1/last_used_at
 * 갱신 — 다음 조립 때 자연히 뒤로 밀린다.
 *
 * 사용법:
 *   npx tsx scripts/toefl/assemble-set.ts --form TOEFL_DEMO_001 [--label "1차 세트"] [--confirm]
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
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

type Args = { form: string; label?: string; confirm: boolean };

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const form = get("form");
  if (!form) {
    console.error("사용법: npx tsx scripts/toefl/assemble-set.ts --form <FORM_CODE> [--label \"설명\"] [--confirm]");
    process.exit(1);
  }
  return { form, label: get("label"), confirm: argv.includes("--confirm") };
}

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type ModuleRow = { id: string; section: string; stage: string; route: string };
type BlueprintRow = { section: string; stage: string; route: string; task_mix: Record<string, number> };
type CandidateItem = { id: string; task_type: string; usage_count: number; last_used_at: string | null };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();

  const { data: form } = await db.from("toefl_form").select("id, code, blueprint_version").eq("code", args.form).maybeSingle();
  if (!form) {
    console.error(`폼을 찾을 수 없습니다: ${args.form}`);
    process.exit(1);
  }

  const [{ data: modules }, { data: blueprint }] = await Promise.all([
    db.from("toefl_module").select("id, section, stage, route").eq("form_id", form.id),
    db.from("toefl_form_blueprint").select("section, stage, route, task_mix").eq("version", form.blueprint_version).eq("is_active", true),
  ]);
  const modRows = (modules ?? []) as ModuleRow[];
  const bpRows = (blueprint ?? []) as BlueprintRow[];

  console.log(`\n폼 ${args.form}(블루프린트 ${form.blueprint_version}) · 모듈 ${modRows.length}개\n`);

  type ModulePlan = { module: ModuleRow; picks: Map<string, CandidateItem[]>; shortfall: { taskType: string; need: number; have: number }[] };
  const plans: ModulePlan[] = [];

  for (const mod of modRows) {
    const bp = bpRows.find((b) => b.section === mod.section && b.stage === mod.stage && b.route === mod.route);
    const taskMix = { ...(bp?.task_mix ?? {}) };
    delete (taskMix as Record<string, unknown>).routing_threshold;

    const picks = new Map<string, CandidateItem[]>();
    const shortfall: ModulePlan["shortfall"] = [];

    for (const [taskType, countRaw] of Object.entries(taskMix)) {
      const count = Number(countRaw) || 0;
      if (count <= 0) continue;
      const { data: pool } = await db
        .from("toefl_item")
        .select("id, task_type, usage_count, last_used_at")
        .eq("module_id", mod.id)
        .eq("task_type", taskType)
        .eq("is_active", true)
        .eq("verified", true)
        .order("usage_count", { ascending: true })
        .order("last_used_at", { ascending: true, nullsFirst: true })
        .limit(count);
      const rows = (pool ?? []) as CandidateItem[];
      picks.set(taskType, rows);
      if (rows.length < count) shortfall.push({ taskType, need: count, have: rows.length });
    }

    plans.push({ module: mod, picks, shortfall });
  }

  let totalItems = 0;
  let totalShortfall = 0;
  for (const plan of plans) {
    const picked = Array.from(plan.picks.values()).reduce((s, arr) => s + arr.length, 0);
    totalItems += picked;
    console.log(`  ${plan.module.section}/${plan.module.stage}/${plan.module.route}: ${picked}문항`);
    for (const s of plan.shortfall) {
      totalShortfall += s.need - s.have;
      console.log(`    ⚠ ${s.taskType}: ${s.have}/${s.need}개뿐(검수 통과 문항 부족)`);
    }
  }
  console.log(`\n총 ${totalItems}문항 조립 예정${totalShortfall > 0 ? `, 부족분 ${totalShortfall}문항(위 ⚠ 참고)` : ""}.\n`);

  if (!args.confirm) {
    console.log("--confirm 이 없어 실제로 저장하지 않습니다.\n");
    return;
  }

  const { data: setRow, error: setErr } = await db
    .from("toefl_assembled_set")
    .insert({ form_id: form.id, label: args.label ?? null, strategy: "least_used" })
    .select("id, set_number")
    .single();
  if (setErr || !setRow) {
    console.error("세트 생성 실패:", setErr?.message);
    process.exit(1);
  }
  console.log(`세트 #${setRow.set_number}(id=${setRow.id}) 생성됨.`);

  const usedItemIds: string[] = [];
  for (const plan of plans) {
    const itemIds = Array.from(plan.picks.values()).flatMap((rows) => rows.map((r) => r.id));
    usedItemIds.push(...itemIds);
    const { error: modErr } = await db
      .from("toefl_assembled_set_module")
      .insert({ set_id: setRow.id, module_id: plan.module.id, item_ids: itemIds });
    if (modErr) console.error(`  · 모듈 ${plan.module.id} 저장 실패: ${modErr.message}`);
  }

  // usage_count/last_used_at 갱신 — 다음 조립 때 이번에 고른 문항이 자연히 뒤로 밀리게.
  // supabase-js는 "컬럼+1" 같은 산술 update를 직접 못 하므로, 현재 값을 읽어와 계산한다.
  const { data: currentUsage } = await db.from("toefl_item").select("id, usage_count").in("id", usedItemIds);
  const usageById = new Map(((currentUsage ?? []) as { id: string; usage_count: number }[]).map((r) => [r.id, r.usage_count]));
  const now = new Date().toISOString();
  for (const id of usedItemIds) {
    await db.from("toefl_item").update({ usage_count: (usageById.get(id) ?? 0) + 1, last_used_at: now }).eq("id", id);
  }

  console.log(`완료: ${usedItemIds.length}문항의 usage_count를 올렸습니다.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
