/**
 * TOEFL 문항 "내용" 품질 AI 자동심사 — 지시서 부록 A-1(원래 "지금 구현하지 말 것"이었으나
 * 2026-08-28 사용자가 408개 검수 부담을 실제로 겪어서 순서를 앞당김,
 * [[toefl-item-pipeline-project]] 참고).
 *
 * zod 검증(형식)과 달리 "내용"을 본다 — 정답 유일성, 오답 그럴듯함, 난이도 일치, 부적절한
 * 소재 여부. 결과에 따라:
 *   pass → 자동으로 verified=true (사람 확인 생략, 2026-08-28 사용자 결정)
 *   flag → verified=false 유지, 사람 검수 큐 최상단으로(review 화면에서 반영)
 *   fail → verified=false 유지, 기본 검수 큐에서는 제외(review 화면에서 반영)
 *
 * Batch API(claude-sonnet-5)로 한 번에 처리한다 — generate-batch.ts와 같은 인프라
 * (thinking:adaptive + effort:low, trailing-comma 복구) 재사용.
 *
 * 사용법:
 *   npx tsx scripts/toefl/ai-review-batch.ts [--form TOEFL_DEMO_001] --dry-run(기본)
 *   npx tsx scripts/toefl/ai-review-batch.ts [--form TOEFL_DEMO_001] --confirm
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { AI_REVIEW_SYSTEM_PROMPT } from "@/lib/toefl/server/ai-review-prompt";
import { extractJsonText } from "@/lib/llm-server";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2000; // 판정 하나(status+note)만 내면 되므로 생성보다 훨씬 작아도 된다.
const PRICE = { input: 2.0 / 2, output: 10.0 / 2, cacheWrite: (2.0 * 1.25) / 2, cacheRead: (2.0 * 0.1) / 2 };
let systemPromptTokens = 0; // --confirm 시 countTokens로 실측해서 채운다.

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

type Args = { form?: string; confirm: boolean };

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { form: get("form"), confirm: argv.includes("--confirm") };
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

function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

type Candidate = {
  id: string;
  task_type: string;
  difficulty: number;
  scoring_mode: string;
  prompt: string;
  payload: unknown;
  answer_key: unknown;
  explanation_ko: string | null;
  stimulusText: string | null;
};

async function fetchCandidates(db: SupabaseClient, form?: string): Promise<Candidate[]> {
  let moduleIds: string[] | null = null;
  if (form) {
    const { data: formRow } = await db.from("toefl_form").select("id").eq("code", form).maybeSingle();
    if (!formRow) throw new Error(`폼을 찾지 못했습니다: ${form}`);
    const { data: mods } = await db.from("toefl_module").select("id").eq("form_id", formRow.id);
    moduleIds = (mods ?? []).map((m) => m.id as string);
  }

  let query = db
    .from("toefl_item")
    .select("id, module_id, stimulus_id, task_type, difficulty, scoring_mode, prompt, payload, answer_key, explanation_ko")
    .eq("verified", false)
    .is("ai_review_status", null);
  if (moduleIds) query = query.in("module_id", moduleIds);
  const { data: items, error } = await query;
  if (error) throw new Error(error.message);

  const stimulusIds = Array.from(new Set((items ?? []).map((i) => i.stimulus_id).filter((x): x is string => !!x)));
  const { data: stimuli } = stimulusIds.length
    ? await db.from("toefl_stimulus").select("id, body, transcript").in("id", stimulusIds)
    : { data: [] as { id: string; body: string | null; transcript: string | null }[] };
  const stimulusById = new Map((stimuli ?? []).map((s) => [s.id, s.body ?? s.transcript ?? null]));

  return (items ?? []).map((it) => ({
    id: it.id,
    task_type: it.task_type,
    difficulty: it.difficulty,
    scoring_mode: it.scoring_mode,
    prompt: it.prompt,
    payload: it.payload,
    answer_key: it.answer_key,
    explanation_ko: it.explanation_ko,
    stimulusText: it.stimulus_id ? (stimulusById.get(it.stimulus_id) ?? null) : null,
  }));
}

function buildUserMessage(c: Candidate): string {
  const parts = [
    `task_type: ${c.task_type}`,
    `difficulty: ${c.difficulty}`,
    `scoring_mode: ${c.scoring_mode}`,
    c.stimulusText ? `passage/transcript:\n${c.stimulusText}` : null,
    `prompt: ${c.prompt}`,
    `payload: ${JSON.stringify(c.payload)}`,
    c.answer_key != null ? `answer_key: ${JSON.stringify(c.answer_key)}` : "answer_key: (none — ai_rubric task, no fixed answer)",
    `explanation_ko: ${c.explanation_ko ?? "(none)"}`,
  ].filter(Boolean);
  return parts.join("\n\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();

  const candidates = await fetchCandidates(db, args.form);
  console.log(`\nAI 자동심사 대상: ${candidates.length}개(검수대기 + 아직 AI심사 안 됨)${args.form ? ` · 폼 ${args.form}` : ""}`);
  if (candidates.length === 0) {
    console.log("심사할 문항이 없습니다.\n");
    return;
  }

  const anthropic = new Anthropic();
  const countRes = await anthropic.messages.countTokens({
    model: MODEL,
    system: AI_REVIEW_SYSTEM_PROMPT,
    messages: [{ role: "user", content: "test" }],
  });
  systemPromptTokens = countRes.input_tokens;

  const estUserTokensPerCall = 400; // 지문 포함 시 더 길 수 있음(대략치)
  const estOutputTokensPerCall = 100; // status+note 한 줄
  // Anthropic 캐싱은 최소 ~1024토큰 프리픽스부터 실제로 걸린다(2026-08-28 생성 프롬프트에서
  // 확인한 것과 같은 제약). 이 심사 프롬프트는 그보다 짧아서(실측 아래 출력) 캐시가 안 걸리고
  // 매 호출 정가로 청구된다 — 비용 계산도 그에 맞게 나눈다(실제로 걸리면 이보다 더 싸질 수 있음).
  const systemCacheEligible = systemPromptTokens >= 1024;
  const systemCost = systemCacheEligible
    ? (systemPromptTokens * PRICE.cacheWrite + (candidates.length - 1) * systemPromptTokens * PRICE.cacheRead) / 1_000_000
    : (candidates.length * systemPromptTokens * PRICE.input) / 1_000_000;
  const estUsd = systemCost + (candidates.length * estUserTokensPerCall * PRICE.input) / 1_000_000 + (candidates.length * estOutputTokensPerCall * PRICE.output) / 1_000_000;
  console.log(
    `예상 비용(근사치): 약 $${estUsd.toFixed(2)} (시스템프롬프트 ${systemPromptTokens}토큰 실측, ` +
      (systemCacheEligible ? `1회 캐시쓰기+${candidates.length - 1}회 캐시읽기)` : `1024토큰 미만이라 캐싱 안 걸림 — 매 호출 정가)`)
  );

  if (!args.confirm) {
    console.log("--confirm 이 없어 실제 API 호출은 하지 않습니다(비용 발생 없음).\n");
    return;
  }

  const requests: Anthropic.Messages.Batches.BatchCreateParams["requests"] = candidates.map((c) => ({
    custom_id: c.id,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: AI_REVIEW_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildUserMessage(c) }],
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
    },
  }));

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

  let passCount = 0;
  let flagCount = 0;
  let failCount = 0;
  let errorCount = 0;
  const notes: string[] = [];

  for await (const result of await anthropic.messages.batches.results(batch.id)) {
    const itemId = result.custom_id;
    if (result.result.type !== "succeeded") {
      errorCount++;
      continue;
    }
    const textBlock = result.result.message.content.find((b: Anthropic.Messages.ContentBlock) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      errorCount++;
      continue;
    }
    let parsed: { status?: string; note?: string };
    try {
      parsed = JSON.parse(stripTrailingCommas(extractJsonText(textBlock.text)));
    } catch {
      errorCount++;
      continue;
    }
    const status = parsed.status === "pass" || parsed.status === "flag" || parsed.status === "fail" ? parsed.status : null;
    if (!status) {
      errorCount++;
      continue;
    }
    const note = String(parsed.note ?? "").slice(0, 500);

    const update: Record<string, unknown> = {
      ai_review_status: status,
      ai_review_note: note,
      ai_reviewed_at: new Date().toISOString(),
    };
    if (status === "pass") update.verified = true;

    const { error: updateErr } = await db.from("toefl_item").update(update).eq("id", itemId);
    if (updateErr) {
      errorCount++;
      continue;
    }

    if (status === "pass") passCount++;
    else if (status === "flag") flagCount++;
    else failCount++;
    if (status !== "pass") notes.push(`${itemId}: [${status}] ${note}`);
  }

  console.log(`완료: pass ${passCount}(자동 검수완료) · flag ${flagCount}(사람 검수 필요) · fail ${failCount}(제외) · 오류 ${errorCount}`);
  if (notes.length) {
    console.log("\nflag/fail 상세(최대 15건):");
    for (const n of notes.slice(0, 15)) console.log(`  · ${n}`);
  }
  console.log("\n/admin/toefl/review 에서 flag 문항만 확인하면 됩니다.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
