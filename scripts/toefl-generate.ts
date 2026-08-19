/**
 * 문항 대량 생성 CLI — 폼 하나를 블루프린트가 요구하는 만큼 채운다.
 *
 * 왜 CLI인가: 폼 하나가 143문항, 10폼이면 1,430문항이다. 관리 화면에서 버튼을 계속 누를
 * 일이 아니고, 서버리스 함수는 60초에서 끊긴다. 이 스크립트는 내 PC에서 돌므로 시간
 * 제한이 없고, 밤에 걸어둘 수 있다.
 *
 * 안전장치:
 * - 이미 있는 문항 수를 먼저 세고 "부족한 만큼만" 만든다. 다시 돌려도 중복이 안 쌓인다.
 * - 저장하는 문항은 verified=false 다. 즉 만들어도 학생에게 안 보인다 — 관리 화면에서
 *   검수를 마쳐야 노출된다(검수 원칙).
 * - --dry-run 으로 "무엇을 얼마나 만들지"만 먼저 볼 수 있다.
 *
 * 오디오(TTS)는 여기서 만들지 않는다. Gemini 무료 등급이 분당 3건이라 생성과 같은 속도로
 * 돌 수 없고, 실패 재시도도 따로 관리해야 한다. 문항을 먼저 채우고 오디오는 별도로 돌린다.
 *
 * 사용법:
 *   npx tsx scripts/toefl-generate.ts --form TOEFL_DEMO_001 --dry-run
 *   npx tsx scripts/toefl-generate.ts --form TOEFL_DEMO_001
 *   npx tsx scripts/toefl-generate.ts --form TOEFL_DEMO_001 --provider ollama --section reading
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * 그리고 provider 에 따라 GEMINI_API_KEY 또는 OLLAMA_BASE_URL/OLLAMA_MODEL.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getGenerator } from "@/lib/toefl/server/generators/registry";
import { callLlm, describeProvider, type LlmProvider } from "@/lib/llm-server";
import type { ItemDraft } from "@/lib/toefl/server/generators/types";

// .env.local 을 직접 읽는다 — dotenv 를 새로 깔지 않으려고. 형식이 단순해서(KEY=VALUE)
// 이 정도면 충분하고, 의존성이 하나 없는 편이 낫다.
function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return; // 파일이 없으면 셸 환경변수만 쓴다
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

type Args = {
  form: string;
  provider: LlmProvider;
  section?: string;
  taskType?: string;
  difficulty: number;
  batchSize: number;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const form = get("form");
  if (!form) {
    console.error("사용법: npx tsx scripts/toefl-generate.ts --form <FORM_CODE> [--provider gemini|ollama] [--section reading] [--type academic_passage] [--batch 5] [--dry-run]");
    process.exit(1);
  }
  const provider = (get("provider") ?? "gemini") as LlmProvider;
  if (provider !== "gemini" && provider !== "ollama") {
    console.error(`알 수 없는 provider: ${provider} (gemini 또는 ollama)`);
    process.exit(1);
  }
  return {
    form,
    provider,
    section: get("section"),
    taskType: get("type"),
    difficulty: Number(get("difficulty") ?? 3),
    // 한 번에 너무 많이 요청하면 응답이 길이 제한에 걸려 통째로 버려진다. 작게 여러 번이 안전하다.
    batchSize: Number(get("batch") ?? 5),
    dryRun: argv.includes("--dry-run"),
  };
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

type Shortfall = {
  moduleId: string;
  section: string;
  stage: string;
  route: string;
  taskType: string;
  need: number;
};

/** 블루프린트가 요구하는 수와 실제 등록된 수를 맞대어 "무엇을 몇 개 더 만들지" 목록을 낸다. */
async function findShortfalls(db: SupabaseClient, args: Args): Promise<Shortfall[]> {
  const { data: form } = await db
    .from("toefl_form")
    .select("id, code, blueprint_version")
    .eq("code", args.form)
    .maybeSingle();
  if (!form) {
    console.error(`폼을 찾지 못했습니다: ${args.form}`);
    process.exit(1);
  }

  const [{ data: blueprint }, { data: modules }] = await Promise.all([
    db.from("toefl_form_blueprint").select("section, stage, route, task_mix").eq("version", form.blueprint_version).eq("is_active", true),
    db.from("toefl_module").select("id, section, stage, route").eq("form_id", form.id),
  ]);

  const out: Shortfall[] = [];
  for (const m of modules ?? []) {
    if (args.section && m.section !== args.section) continue;
    const bp = (blueprint ?? []).find((b) => b.section === m.section && b.stage === m.stage && b.route === m.route);
    if (!bp) continue;

    const { data: existing } = await db
      .from("toefl_item")
      .select("task_type")
      .eq("module_id", m.id)
      .eq("is_active", true);
    const counts: Record<string, number> = {};
    for (const it of existing ?? []) counts[it.task_type] = (counts[it.task_type] ?? 0) + 1;

    for (const [taskType, required] of Object.entries(bp.task_mix as Record<string, number>)) {
      // task_mix 에는 routing_threshold 같은 설정값도 섞여 있다 — 생성기가 있는 유형만 만든다.
      if (!getGenerator(taskType)) continue;
      if (args.taskType && taskType !== args.taskType) continue;
      const need = Number(required) - (counts[taskType] ?? 0);
      if (need > 0) out.push({ moduleId: m.id, section: m.section, stage: m.stage, route: m.route, taskType, need });
    }
  }
  return out;
}

/** 지문이 필요한 유형은 지문 1개 + 문항 N개를 함께 저장한다. */
async function saveBatch(
  db: SupabaseClient,
  shortfall: Shortfall,
  stimulus: { title: string; text: string } | null,
  drafts: ItemDraft[],
  difficulty: number
): Promise<{ saved: number; skipped: string[] }> {
  const generator = getGenerator(shortfall.taskType)!;
  const skipped: string[] = [];

  let stimulusId: string | null = null;
  if (generator.needsStimulus && stimulus?.text) {
    const { data: stimRow, error } = await db
      .from("toefl_stimulus")
      .insert({
        module_id: shortfall.moduleId,
        task_type: shortfall.taskType,
        title: stimulus.title || null,
        // 듣기 스크립트는 transcript 로도 남긴다 — 오디오를 나중에 만들 때 원문이 필요하다.
        body: generator.stimulusAudio ? null : stimulus.text,
        transcript: generator.stimulusAudio ? stimulus.text : null,
        position: 1,
      })
      .select("id")
      .single();
    if (error || !stimRow) return { saved: 0, skipped: [`지문 저장 실패: ${error?.message}`] };
    stimulusId = stimRow.id as string;
  }

  const { data: maxItem } = await db
    .from("toefl_item")
    .select("position")
    .eq("module_id", shortfall.moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (maxItem?.position ?? 0) + 1;

  let saved = 0;
  for (const draft of drafts) {
    const row = generator.toItemRow({ ...draft, skill_tags: draft.skill_tags ?? [] });
    if (!row.ok) {
      skipped.push(row.message);
      continue;
    }
    const { error } = await db.from("toefl_item").insert({
      module_id: shortfall.moduleId,
      stimulus_id: stimulusId,
      task_type: shortfall.taskType,
      position: position++,
      difficulty,
      scoring_mode: generator.scoringMode,
      prompt: row.prompt,
      payload: row.payload,
      answer_key: row.answerKey,
      explanation_ko: draft.explanation_ko,
      skill_tags: draft.skill_tags ?? [],
      // 검수 전이라 학생에게 안 보인다. 관리 화면에서 승인해야 노출된다.
      verified: false,
      source: "ai",
    });
    if (error) skipped.push(`저장 실패: ${error.message}`);
    else saved += 1;
  }
  return { saved, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();

  console.log(`\n폼 ${args.form} · 생성기 ${describeProvider(args.provider)} · 난이도 ${args.difficulty}`);
  const shortfalls = await findShortfalls(db, args);

  if (shortfalls.length === 0) {
    console.log("부족한 문항이 없습니다. 블루프린트를 이미 충족했습니다.\n");
    return;
  }

  const total = shortfalls.reduce((s, x) => s + x.need, 0);
  console.log(`\n부족분 ${total}문항:`);
  for (const s of shortfalls) {
    console.log(`  ${s.section.padEnd(10)} ${s.stage}/${s.route.padEnd(5)} ${s.taskType.padEnd(20)} ${s.need}문항`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run 이라 생성하지 않고 끝냅니다.\n");
    return;
  }

  let done = 0;
  let failed = 0;
  for (const shortfall of shortfalls) {
    const generator = getGenerator(shortfall.taskType)!;
    let remaining = shortfall.need;

    while (remaining > 0) {
      // 지문 공유 유형은 한 지문에 여러 문항이 달리므로 한 번에 만드는 개수를 지문 단위로 맞춘다.
      const count = Math.min(remaining, args.batchSize);
      const label = `${shortfall.section}/${shortfall.stage}/${shortfall.route} ${shortfall.taskType}`;
      process.stdout.write(`  ${label} ${count}문항 생성 중… `);

      const prompt = generator.buildPrompt({ itemsPerUnit: count, difficulty: args.difficulty });
      const res = await callLlm(prompt, { provider: args.provider, temperature: 0.8, json: true });
      if (!res.ok) {
        console.log(`실패 — ${res.message}`);
        failed += count;
        break;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(res.text);
      } catch {
        console.log("실패 — JSON 해석 불가");
        failed += count;
        break;
      }
      const parsed = generator.parse((parsedJson ?? {}) as Record<string, unknown>);
      if (!parsed.ok) {
        console.log(`실패 — ${parsed.message}`);
        failed += count;
        break;
      }

      const { saved, skipped } = await saveBatch(db, shortfall, parsed.stimulus, parsed.items, args.difficulty);
      console.log(`저장 ${saved}${skipped.length ? ` (건너뜀 ${skipped.length})` : ""}`);
      for (const msg of skipped.slice(0, 3)) console.log(`      · ${msg}`);

      if (saved === 0) {
        // 계속 돌려도 같은 이유로 실패할 가능성이 크다 — 이 유형은 여기서 멈춘다.
        failed += remaining;
        break;
      }
      done += saved;
      remaining -= saved;
    }
  }

  console.log(`\n완료: ${done}문항 저장, ${failed}문항 실패.`);
  console.log("저장된 문항은 verified=false 라 아직 학생에게 안 보입니다 — /admin/toefl/items 에서 검수해 주세요.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
