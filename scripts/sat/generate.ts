/**
 * SAT 문항 배치 생성 CLI — 지시서 SAT P1 §4.
 *
 * RW: rw-topics.json에서 소재를 순서대로 꺼내(커서 파일로 진행 추적) 소재당 문항 1개,
 * 스킬은 11개를 라운드로빈으로 배정. Math: 스킬 1개를 20문항(난이도 1~5×4개) 배치로.
 * 결과는 전부 Gate A(src/lib/sat/gate-a.ts)를 통과한 것만 verified=false로 sat_stimuli/
 * sat_questions에 저장한다. Anthropic Batch API(claude-sonnet-5 — Opus 금지) 사용.
 *
 * 사용법:
 *   npx tsx scripts/sat/generate.ts --section rw --topics 20 [--dry-run]
 *   npx tsx scripts/sat/generate.ts --section math --skill linear_functions [--dry-run]
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonText } from "@/lib/llm-server";
import { SAT_SYSTEM_PROMPT } from "@/lib/sat/server/generation-system-prompt";
import { buildRwPrompt, type RwTopic } from "@/lib/sat/server/rw-prompt";
import { buildMathPrompt } from "@/lib/sat/server/math-prompt";
import { runGateA, type GateRuleId } from "@/lib/sat/gate-a";
import { RW_SKILLS, skillToDomain, type MathSkill, type RwSkill, type SatSkill } from "@/lib/sat/taxonomy";
import { parseSpr } from "@/lib/sat/spr";
import { MathGeneratedBatchSchema, type MathGeneratedItem, type RwGeneratedItem } from "@/lib/sat/generation-schemas";

const MODEL = "claude-sonnet-5"; // 지시서: 생성 모델은 Sonnet 5 기본, Opus는 쓰지 마라.
const MAX_TOKENS_RW = 3000;
const MAX_TOKENS_MATH = 16000; // 한 번에 20문항

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TOPICS_PATH = path.join(SCRIPT_DIR, "data", "rw-topics.json");
const CURSOR_PATH = path.join(SCRIPT_DIR, "data", "rw-topics-cursor.json");

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

type Args = { section: "rw" | "math"; topics: number; skill?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const section = get("section");
  if (section !== "rw" && section !== "math") {
    console.error(
      "사용법: npx tsx scripts/sat/generate.ts --section rw --topics 20 [--dry-run]\n" +
        "      npx tsx scripts/sat/generate.ts --section math --skill <skill> [--dry-run]",
    );
    process.exit(1);
  }
  if (section === "math" && !get("skill")) {
    console.error("--section math 에는 --skill <skill> 이 필요합니다.");
    process.exit(1);
  }
  return {
    section,
    topics: Number(get("topics") ?? 20),
    skill: get("skill"),
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

// claude-sonnet-5가 배열/객체 마지막 항목 뒤에 쉼표를 남기는 경우가 있다(TOEFL 파이프라인에서도
// 확인된 문제 — scripts/toefl/generate-batch.ts 참고). 파싱 전에 제거한다.
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

function answerLetter(index: number): string {
  return ["A", "B", "C", "D"][index] ?? "?";
}

interface Tally {
  requested: number;
  discardByRule: Map<GateRuleId | "PARSE_FAIL", number>;
  held: number;
  inserted: number;
}

function newTally(requested: number): Tally {
  return { requested, discardByRule: new Map(), held: 0, inserted: 0 };
}

function bumpDiscard(tally: Tally, rule: GateRuleId | "PARSE_FAIL") {
  tally.discardByRule.set(rule, (tally.discardByRule.get(rule) ?? 0) + 1);
}

function printReport(tally: Tally) {
  const discardedTotal = [...tally.discardByRule.values()].reduce((a, b) => a + b, 0);
  console.log(`\n생성 요청: ${tally.requested}`);
  console.log(`폐기(규칙별):`);
  if (tally.discardByRule.size === 0) console.log("  (없음)");
  for (const [rule, count] of tally.discardByRule) console.log(`  ${rule}: ${count}`);
  console.log(`보류: ${tally.held}`);
  console.log(`삽입: ${tally.inserted}`);
  const rejectionRate = tally.requested > 0 ? ((discardedTotal + tally.held) / tally.requested) * 100 : 0;
  console.log(`반려율(폐기+보류 / 생성): ${rejectionRate.toFixed(1)}%`);
  if (rejectionRate > 30) {
    console.log("⚠️  반려율이 30%를 넘었습니다 — 원인 분석이 먼저 필요합니다(완료 보고 보류).");
  }
}

async function submitAndWait(
  anthropic: Anthropic,
  requests: Anthropic.Messages.Batches.BatchCreateParams["requests"],
) {
  console.log(`Batch API에 ${requests.length}건 제출 중…`);
  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`Batch ID: ${batch.id} (상태: ${batch.processing_status})`);
  let current = batch;
  while (current.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, 20_000));
    current = await anthropic.messages.batches.retrieve(batch.id);
    console.log(
      `  진행 중… 완료 ${current.request_counts.succeeded + current.request_counts.errored}/${requests.length}` +
        `(성공 ${current.request_counts.succeeded}, 실패 ${current.request_counts.errored})`,
    );
  }
  console.log("Batch 완료.\n");
  return batch;
}

function extractResultText(result: Anthropic.Messages.Batches.MessageBatchIndividualResponse): string | null {
  if (result.result.type !== "succeeded") return null;
  const textBlock = result.result.message.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : null;
}

// ───────── RW ─────────

function loadCursor(): number {
  if (!existsSync(CURSOR_PATH)) return 0;
  try {
    const data = JSON.parse(readFileSync(CURSOR_PATH, "utf8")) as { cursor: number };
    return data.cursor ?? 0;
  } catch {
    return 0;
  }
}

function saveCursor(cursor: number) {
  writeFileSync(CURSOR_PATH, JSON.stringify({ cursor }, null, 2) + "\n", "utf8");
}

async function runRw(args: Args, db: SupabaseClient, batchId: string) {
  const allTopics: RwTopic[] = JSON.parse(readFileSync(TOPICS_PATH, "utf8"));
  const cursor = loadCursor();
  const slice = allTopics.slice(cursor, cursor + args.topics);
  if (slice.length === 0) {
    console.log("남은 RW 소재가 없습니다(200개 전부 소진). rw-topics.json을 늘리거나 커서를 리셋하세요.");
    return;
  }
  if (slice.length < args.topics) {
    console.warn(`남은 소재가 ${slice.length}개뿐입니다(요청 ${args.topics}개).`);
  }

  const skillFor = (i: number): RwSkill => RW_SKILLS[(cursor + i) % RW_SKILLS.length].key;

  const requests: Anthropic.Messages.Batches.BatchCreateParams["requests"] = slice.map((topic, i) => ({
    custom_id: topic.id,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS_RW,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: SAT_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildRwPrompt(topic, skillFor(i)) }],
    },
  }));

  const anthropic = new Anthropic();
  const batch = await submitAndWait(anthropic, requests);

  const tally = newTally(requests.length);
  const toInsert: { skill: RwSkill; item: RwGeneratedItem; gateFlags: string[] }[] = [];

  for await (const result of await anthropic.messages.batches.results(batch.id)) {
    const idx = slice.findIndex((t) => t.id === result.custom_id);
    const skill = idx >= 0 ? skillFor(idx) : RW_SKILLS[0].key;

    const text = extractResultText(result);
    if (!text) {
      bumpDiscard(tally, "PARSE_FAIL");
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(stripTrailingCommas(extractJsonText(text)));
    } catch {
      bumpDiscard(tally, "PARSE_FAIL");
      continue;
    }

    const gate = runGateA(json, "rw");
    if (gate.verdict === "discard") {
      for (const rule of gate.discardRules) bumpDiscard(tally, rule);
      continue;
    }
    if (gate.verdict === "hold") tally.held++;
    toInsert.push({ skill, item: gate.item as RwGeneratedItem, gateFlags: gate.holdRules });
  }

  printReport(tally);

  if (args.dryRun) {
    console.log("\n--dry-run 이라 DB에 삽입하지 않았습니다.");
    return;
  }

  for (const { skill, item, gateFlags } of toInsert) {
    const domain = skillToDomain(skill as SatSkill);
    const { data: stim, error: stimErr } = await db
      .from("sat_stimuli")
      .insert({ domain, passage_text: item.stimulus.passageText, verified: false, source: "ai", batch_id: batchId })
      .select("id")
      .single();
    if (stimErr || !stim) {
      console.error(`지문 삽입 실패(${item.materialId}):`, stimErr?.message);
      continue;
    }

    const correctIndex = item.question.choices.indexOf(item.question.answerText);
    const { error: qErr } = await db.from("sat_questions").insert({
      stimulus_id: stim.id,
      section: "rw",
      domain,
      skill,
      difficulty: item.question.difficulty,
      format: "mcq",
      prompt: item.question.prompt,
      payload: { choices: item.question.choices, figure: item.question.figure ?? null },
      answer_key: { type: "mcq", correct: answerLetter(correctIndex) },
      explanation_ko: item.question.explanationKo,
      verified: false,
      source: "ai",
      batch_id: batchId,
      gate_flags: gateFlags,
    });
    if (qErr) {
      console.error(`문항 삽입 실패(${item.materialId}):`, qErr.message);
      continue;
    }
    tally.inserted++;
  }

  saveCursor(cursor + slice.length);
  console.log(`실제 삽입: ${tally.inserted}건. batch_id=${batchId}`);
}

// ───────── Math ─────────

function rawSprToRationalJson(raw: string): { n: string; d: string } {
  const parsed = parseSpr(raw);
  if (!parsed.ok) throw new Error(`Gate A5를 통과했는데 파싱 실패 — 버그: ${raw}`);
  return { n: parsed.value.n.toString(), d: parsed.value.d.toString() };
}

function sprAcceptedToJson(raw: string[]): { n: string; d: string }[] {
  return raw.map(rawSprToRationalJson);
}

async function runMath(args: Args, db: SupabaseClient, batchId: string) {
  const skill = args.skill as MathSkill;
  const domain = skillToDomain(skill as SatSkill);

  const request: Anthropic.Messages.Batches.BatchCreateParams["requests"][number] = {
    custom_id: `math_${skill}`,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS_MATH,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: SAT_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildMathPrompt(skill) }],
    },
  };

  const anthropic = new Anthropic();
  const batch = await submitAndWait(anthropic, [request]);

  const tally = newTally(20); // 배치 스펙상 20문항 요청
  const toInsert: { item: MathGeneratedItem; gateFlags: string[] }[] = [];

  for await (const result of await anthropic.messages.batches.results(batch.id)) {
    const text = extractResultText(result);
    if (!text) {
      for (let i = 0; i < 20; i++) bumpDiscard(tally, "PARSE_FAIL");
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(stripTrailingCommas(extractJsonText(text)));
    } catch {
      for (let i = 0; i < 20; i++) bumpDiscard(tally, "PARSE_FAIL");
      continue;
    }

    const batchParsed = MathGeneratedBatchSchema.safeParse(json);
    if (!batchParsed.success) {
      for (let i = 0; i < 20; i++) bumpDiscard(tally, "PARSE_FAIL");
      continue;
    }

    // 응답 건수가 20과 다를 수 있으므로 실제 개수로 다시 맞춘다.
    tally.requested = batchParsed.data.items.length;
    for (const rawItem of batchParsed.data.items) {
      const gate = runGateA(rawItem, "math", { mathSkill: skill });
      if (gate.verdict === "discard") {
        for (const rule of gate.discardRules) bumpDiscard(tally, rule);
        continue;
      }
      if (gate.verdict === "hold") tally.held++;
      toInsert.push({ item: gate.item as MathGeneratedItem, gateFlags: gate.holdRules });
    }
  }

  printReport(tally);

  if (args.dryRun) {
    console.log("\n--dry-run 이라 DB에 삽입하지 않았습니다.");
    return;
  }

  for (const { item, gateFlags } of toInsert) {
    const payload: Record<string, unknown> = { figure: item.figure ?? null };
    let answerKey: Record<string, unknown>;
    if (item.format === "mcq") {
      payload.choices = item.choices;
      const correctIndex = item.choices.indexOf(item.answerText);
      answerKey = { type: "mcq", correct: answerLetter(correctIndex) };
    } else {
      answerKey = {
        type: "spr",
        accepted: sprAcceptedToJson(item.sprAccepted),
        tolerance: item.sprTolerance
          ? { min: rawSprToRationalJson(item.sprTolerance.min), max: rawSprToRationalJson(item.sprTolerance.max) }
          : null,
      };
    }

    const { error: qErr } = await db.from("sat_questions").insert({
      stimulus_id: null,
      section: "math",
      domain,
      skill,
      difficulty: item.difficulty,
      format: item.format,
      prompt: item.prompt,
      payload,
      answer_key: answerKey,
      explanation_ko: item.explanationKo,
      verified: false,
      source: "ai",
      batch_id: batchId,
      gate_flags: gateFlags,
    });
    if (qErr) {
      console.error("문항 삽입 실패:", qErr.message);
      continue;
    }
    tally.inserted++;
  }

  console.log(`실제 삽입: ${tally.inserted}건. batch_id=${batchId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();
  const batchId = crypto.randomUUID();

  console.log(`\nSAT 문항 생성 — section=${args.section}${args.dryRun ? " (dry-run)" : ""} · batch_id=${batchId}`);

  if (args.section === "rw") {
    await runRw(args, db, batchId);
  } else {
    await runMath(args, db, batchId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
