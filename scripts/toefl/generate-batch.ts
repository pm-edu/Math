/**
 * TOEFL 문항 대량 생성 — Anthropic Batch API(claude-sonnet-5, 50% 할인) + 프롬프트 캐싱+
 * 주제 다양성 주입. 문항 파이프라인 지시서(2026-08-28) Phase 2, [[toefl-item-pipeline-project]]
 * 참고. 기존 scripts/toefl-generate.ts(Gemini/Ollama 단건 호출)는 안 건드리고 그대로 둔다 —
 * 이 스크립트는 "어떻게 대량으로 돌리고 분배하는지"만 새로 만들고, 문항 모양을 만드는 로직
 * (생성기 buildPrompt/parse/toItemRow)과 저장 로직(saveShortfallBatch)은 전부 재사용한다.
 *
 * 안전장치:
 * - 부족분·예상 비용을 먼저 출력한다. --confirm 없이는 실제 API 호출을 하지 않는다(비용 발생 없음).
 * - 저장하는 문항은 verified=false 다 — 관리 화면에서 검수해야 학생에게 노출된다.
 * - toefl_generation_run(런 전체) + toefl_generation_batch(모듈×유형별, run_id로 연결)에
 *   생성 이력을 남긴다 — "3번 런만 다시 검토" 같은 요청을 나중에 run_id로 처리할 수 있다.
 *
 * 사용법:
 *   npx tsx scripts/toefl/generate-batch.ts --form TOEFL_DEMO_001 --sets 3 --dry-run(기본)
 *   npx tsx scripts/toefl/generate-batch.ts --form TOEFL_DEMO_001 --sets 3 --confirm
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getGenerator } from "@/lib/toefl/server/generators/registry";
import { findShortfalls, saveShortfallBatch, type Shortfall } from "@/lib/toefl/server/generation-shortfall";
import { TOEFL_2026_SYSTEM_PROMPT } from "@/lib/toefl/server/generation-system-prompt";
import { extractJsonText } from "@/lib/llm-server";

const PROMPT_VERSION = "2026-system-v1"; // TOEFL_2026_SYSTEM_PROMPT 버전 — 프롬프트 바꾸면 이 문자열도 올릴 것.
const MODEL = "claude-sonnet-5";
const UNIT_SIZE = 5; // 한 번의 호출에 몇 문항을 요청할지(기존 CLI와 같은 값 — 너무 많으면 응답이 잘림).
const MAX_TOKENS = 8000; // thinking(낮은 강도)이 예산을 조금 쓰더라도 JSON 출력이 잘리지 않게 여유를 둠.

// Batch API 50% 할인 반영한 claude-sonnet-5 요금(1M 토큰당, 2026-06-24 기준 — claude-api 스킬 참고).
const PRICE = { input: 2.0 / 2, output: 10.0 / 2, cacheWrite: (2.0 * 1.25) / 2, cacheRead: (2.0 * 0.1) / 2 };
// 프롬프트당 대략적인 추정치(실측 아님, 안전판단용) — countTokens로 시스템 프롬프트만 실측(1666).
const SYSTEM_PROMPT_TOKENS = 1783; // countTokens로 실측(2026-08-28) — 프롬프트 바꾸면 다시 잴 것.
const EST_USER_TOKENS_PER_CALL = 250; // 유형별 지시문+JSON 스키마 예시(호출 1건당, 문항 수 무관하게 거의 고정)
const EST_OUTPUT_TOKENS_PER_ITEM = 400; // 문항 1개당 평균(지문 있는 유형이 더 길고 없는 유형은 짧음 — 평균값)

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

type Args = {
  form: string;
  sets: number;
  difficulty: number;
  section?: string;
  taskType?: string;
  label?: string;
  confirm: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const form = get("form");
  if (!form) {
    console.error(
      "사용법: npx tsx scripts/toefl/generate-batch.ts --form <FORM_CODE> [--sets 3] [--difficulty 3] [--section reading] [--type academic_passage] [--label \"설명\"] [--confirm]"
    );
    process.exit(1);
  }
  return {
    form,
    sets: Number(get("sets") ?? 1),
    difficulty: Number(get("difficulty") ?? 3),
    section: get("section"),
    taskType: get("type"),
    label: get("label"),
    confirm: argv.includes("--confirm"),
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

// ───────── 주제 다양성 — 시드를 섞어서 순환 배정한다(다 쓰면 다시 섞어서 이어감) ─────────
const ACADEMIC_TASK_TYPES = new Set(["academic_passage", "academic_talk", "academic_discussion"]);

function makeTopicPicker(seeds: { academic: string[]; everyday: string[] }) {
  const state: Record<"academic" | "everyday", { pool: string[]; i: number }> = {
    academic: { pool: shuffle(seeds.academic), i: 0 },
    everyday: { pool: shuffle(seeds.everyday), i: 0 },
  };
  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  return function pick(taskType: string): string {
    const key = ACADEMIC_TASK_TYPES.has(taskType) ? "academic" : "everyday";
    const s = state[key];
    if (s.i >= s.pool.length) {
      s.pool = shuffle(s.pool);
      s.i = 0;
    }
    return s.pool[s.i++];
  };
}

type Chunk = { shortfall: Shortfall; batchDbId: string; count: number; topic: string; customId: string };

function planChunks(shortfalls: Shortfall[], batchIdByShortfall: Map<Shortfall, string>, pickTopic: (t: string) => string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const s of shortfalls) {
    const batchDbId = batchIdByShortfall.get(s)!;
    let remaining = s.need;
    let idx = 0;
    while (remaining > 0) {
      const count = Math.min(remaining, UNIT_SIZE);
      // Anthropic custom_id는 ^[a-zA-Z0-9_-]{1,64}$ 만 허용 — 콜론(:) 쓰면 400.
      chunks.push({ shortfall: s, batchDbId, count, topic: pickTopic(s.taskType), customId: `${batchDbId}_${idx}` });
      remaining -= count;
      idx += 1;
    }
  }
  return chunks;
}

// claude-sonnet-5가 배열/객체 마지막 항목 뒤에 쉼표를 남기는 경우가 실사용 중 확인됨
// (2026-08-28 런 #2·#3, JSON.parse 실패의 상당수 원인) — strict JSON은 이걸 허용 안 하므로
// 파싱 전에 제거한다. 문자열 값 안의 쉼표는 이 정규식이 안 건드린다(따옴표+공백+닫는
// 괄호 패턴만 매치).
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

function estimateCostUsd(totalItems: number, numCalls: number): number {
  const systemInputCost =
    ((SYSTEM_PROMPT_TOKENS * PRICE.cacheWrite + (numCalls - 1) * SYSTEM_PROMPT_TOKENS * PRICE.cacheRead) / 1_000_000) || 0;
  const userInputCost = (numCalls * EST_USER_TOKENS_PER_CALL * PRICE.input) / 1_000_000;
  const outputCost = (totalItems * EST_OUTPUT_TOKENS_PER_ITEM * PRICE.output) / 1_000_000;
  return systemInputCost + userInputCost + outputCost;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();

  console.log(`\n폼 ${args.form} · Batch API(${MODEL}) · ${args.sets}세트분 · 난이도 ${args.difficulty}`);
  const shortfalls = await findShortfalls(db, args);

  if (shortfalls.length === 0) {
    console.log(`부족한 문항이 없습니다(${args.sets}세트분 이미 충족).\n`);
    return;
  }

  const total = shortfalls.reduce((s, x) => s + x.need, 0);
  const numCalls = shortfalls.reduce((s, x) => s + Math.ceil(x.need / UNIT_SIZE), 0);
  console.log(`\n부족분 ${total}문항 (호출 ${numCalls}건):`);
  for (const s of shortfalls) {
    console.log(`  ${s.section.padEnd(10)} ${s.stage}/${s.route.padEnd(5)} ${s.taskType.padEnd(20)} ${s.need}문항`);
  }

  const estUsd = estimateCostUsd(total, numCalls);
  console.log(`\n예상 비용(근사치, 실측 아님): 약 $${estUsd.toFixed(2)}`);
  console.log(`  - 시스템 프롬프트 ${SYSTEM_PROMPT_TOKENS}토큰(실측) × 1회 캐시쓰기 + ${numCalls - 1}회 캐시읽기`);
  console.log(`  - 호출당 사용자 프롬프트 ~${EST_USER_TOKENS_PER_CALL}토큰(추정), 문항당 출력 ~${EST_OUTPUT_TOKENS_PER_ITEM}토큰(추정)`);
  console.log(`  - claude-sonnet-5 Batch API 요금(50% 할인) 기준\n`);

  if (!args.confirm) {
    console.log("--confirm 이 없어 실제 API 호출은 하지 않습니다(비용 발생 없음).\n");
    return;
  }

  const anthropic = new Anthropic();

  const seedsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "topic-seeds.json");
  const seeds = JSON.parse(readFileSync(seedsPath, "utf8")) as { academic: string[]; everyday: string[] };
  const pickTopic = makeTopicPicker(seeds);

  // ── 1) run + 모듈×유형별 batch 행 먼저 만든다 ──
  const { data: run, error: runErr } = await db
    .from("toefl_generation_run")
    .insert({
      label: args.label ?? `${args.form} ${args.sets}세트분`,
      target_sets: args.sets,
      requested_count: total,
      model_used: MODEL,
      prompt_version: PROMPT_VERSION,
      status: "generating",
    })
    .select("id, run_number")
    .single();
  if (runErr || !run) {
    console.error("생성 런 기록 실패:", runErr?.message);
    process.exit(1);
  }
  console.log(`런 #${run.run_number} 생성됨(id=${run.id}).`);

  const batchIdByShortfall = new Map<Shortfall, string>();
  for (const s of shortfalls) {
    const { data: batchRow, error } = await db
      .from("toefl_generation_batch")
      .insert({
        run_id: run.id,
        module_id: s.moduleId,
        task_type: s.taskType,
        requested_count: s.need,
        difficulty: args.difficulty,
        model: MODEL,
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !batchRow) {
      console.error(`배치 기록 실패(${s.section}/${s.stage}/${s.route} ${s.taskType}):`, error?.message);
      continue;
    }
    batchIdByShortfall.set(s, batchRow.id as string);
  }

  const chunks = planChunks(
    shortfalls.filter((s) => batchIdByShortfall.has(s)),
    batchIdByShortfall,
    pickTopic
  );

  // ── 2) Anthropic Batch API에 한 번에 제출 ──
  const requests: Anthropic.Messages.Batches.BatchCreateParams["requests"] = chunks.map((c) => {
    const generator = getGenerator(c.shortfall.taskType)!;
    const prompt = generator.buildPrompt({ itemsPerUnit: c.count, topic: c.topic, difficulty: args.difficulty });
    return {
      custom_id: c.customId,
      params: {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // claude-sonnet-5는 thinking을 안 주면 기본 적응형 사고가 켜져서, 실사용 중
        // max_tokens 예산의 90%+ 를 사고에 써버리고 정작 JSON 출력이 잘리는 문제를 겪었다
        // (2026-08-28 런 #2, thinking_tokens 3740~4095/4096). 그렇다고 완전히
        // thinking: disabled로 끄면 더 나쁜 부작용이 남 — 모델이 placeholder 텍스트나
        // "이 문장은 잘못 생성된 예시입니다" 같은 자기지시적 문구를 출력하는 문서화된
        // 부작용을 그대로 겪었다(런 #4). Anthropic 공식 권고대로 완전 비활성화 대신
        // 낮은 강도의 적응형 사고로 절충한다.
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: [{ type: "text", text: TOEFL_2026_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: prompt }],
      },
    };
  });

  console.log(`\nBatch API에 ${requests.length}건 제출 중…`);
  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`Batch ID: ${batch.id} (상태: ${batch.processing_status})`);

  let current = batch;
  while (current.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, 20_000));
    current = await anthropic.messages.batches.retrieve(batch.id);
    console.log(
      `  진행 중… 완료 ${current.request_counts.succeeded + current.request_counts.errored}/${requests.length}` +
        `(성공 ${current.request_counts.succeeded}, 실패 ${current.request_counts.errored})`
    );
  }
  console.log("Batch 완료.\n");

  // ── 3) 결과 저장 ──
  const chunkByCustomId = new Map(chunks.map((c) => [c.customId, c]));
  let savedTotal = 0;
  let failedTotal = 0;
  const failMessages: string[] = [];

  for await (const result of await anthropic.messages.batches.results(batch.id)) {
    const chunk = chunkByCustomId.get(result.custom_id);
    if (!chunk) continue;

    if (result.result.type !== "succeeded") {
      failedTotal += chunk.count;
      failMessages.push(`${chunk.customId}: ${result.result.type}`);
      continue;
    }

    const textBlock = result.result.message.content.find((b: Anthropic.Messages.ContentBlock) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      failedTotal += chunk.count;
      failMessages.push(`${chunk.customId}: 텍스트 응답 없음`);
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripTrailingCommas(extractJsonText(textBlock.text)));
    } catch {
      failedTotal += chunk.count;
      failMessages.push(`${chunk.customId}: JSON 해석 실패`);
      continue;
    }

    const generator = getGenerator(chunk.shortfall.taskType)!;
    const parsed = generator.parse((parsedJson ?? {}) as Record<string, unknown>);
    if (!parsed.ok) {
      failedTotal += chunk.count;
      failMessages.push(`${chunk.customId}: ${parsed.message}`);
      continue;
    }

    const { saved, skipped } = await saveShortfallBatch(db, chunk.shortfall, parsed.stimulus, parsed.items, args.difficulty, {
      batchId: chunk.batchDbId,
    });
    savedTotal += saved;
    failedTotal += chunk.count - saved;
    failMessages.push(...skipped.map((m) => `${chunk.customId}: ${m}`));
  }

  // ── 4) run/batch 상태 마무리 ──
  await db.from("toefl_generation_run").update({ generated_count: savedTotal, status: "reviewing" }).eq("id", run.id);
  for (const batchDbId of new Set(batchIdByShortfall.values())) {
    await db.from("toefl_generation_batch").update({ status: "reviewing" }).eq("id", batchDbId);
  }

  console.log(`완료: ${savedTotal}문항 저장, ${failedTotal}문항 실패.`);
  if (failMessages.length) {
    console.log("실패 상세(최대 10건):");
    for (const m of failMessages.slice(0, 10)) console.log(`  · ${m}`);
  }
  console.log(`\n런 #${run.run_number}(id=${run.id}) — 저장된 문항은 verified=false 라 학생에게 안 보입니다.`);
  console.log("/admin/toefl/items 에서 검수해 주세요.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
