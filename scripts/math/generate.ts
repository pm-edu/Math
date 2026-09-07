/**
 * 수학 문항 대량 생성 — RUN_MATH_PROGRESSION.md PG-A 게이트 1이 STOP된 것을 풀기 위한
 * 선행 작업("문항을 먼저 채워 넣자", 2026-09-07). Anthropic Batch API(claude-sonnet-5) +
 * TOEFL의 "AI 자동심사"와 같은 원리의 독립 재검증(생성 답과 다시 풀어본 답이 일치해야
 * verified=true, 불일치는 verified=false로 넣어 사람이 검토) — src/lib/toefl/server/
 * ai-review-prompt.ts 참고.
 *
 * 자동채점 두 형식(mcq/numeric)만 만든다. numeric 검증은 src/lib/sat/spr.ts의 bigint
 * 유리수 파서를 그대로 재사용한다(RUN_MATH_PROGRESSION.md 지시).
 *
 * 재검증은 단원 단위(생성과 같은 크기, ~6문항)로 쪼개서 순차 호출한다 — 한 번에 183개를
 * 몰아서 보냈다가 응답이 잘려 파싱이 통째로 실패한 적이 있다(2026-09-07 실사용 중 발견).
 *
 * 사용법:
 *   npx tsx scripts/math/generate.ts --curriculumDetail IGCSE_0607 --countPerUnit 6 --dry-run
 *   npx tsx scripts/math/generate.ts --curriculumDetail IGCSE_0607 --countPerUnit 6
 *   npx tsx scripts/math/generate.ts --resumeBatchId msgbatch_xxx --curriculumDetail IGCSE_0607 --countPerUnit 6
 *     (이미 끝난 배치 결과를 재생성 없이 재사용 — 검증/삽입 단계에서 실패했을 때 복구용)
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import katex from "katex";
import { extractJsonText } from "@/lib/llm-server";
import { parseSpr } from "@/lib/sat/spr";
import { MATH_SYSTEM_PROMPT } from "@/lib/math/server/generation-system-prompt";
import { buildMathUnitPrompt, type MathUnit } from "@/lib/math/server/unit-prompt";
import { MathGeneratedBatchSchema, type MathGeneratedItem } from "@/lib/math/server/generation-schemas";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 8000;
const LETTERS = ["A", "B", "C", "D"] as const;

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

type Args = { curriculumDetail: string; countPerUnit: number; unitLimit?: number; resumeBatchId?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const curriculumDetail = get("curriculumDetail");
  if (!curriculumDetail) {
    console.error(
      "사용법: npx tsx scripts/math/generate.ts --curriculumDetail IGCSE_0607 [--countPerUnit 6] [--unitLimit N] [--resumeBatchId id] [--dry-run]"
    );
    process.exit(1);
  }
  const unitLimitRaw = get("unitLimit");
  return {
    curriculumDetail,
    countPerUnit: Number(get("countPerUnit") ?? 6),
    unitLimit: unitLimitRaw ? Number(unitLimitRaw) : undefined,
    resumeBatchId: get("resumeBatchId"),
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

function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, "$1");
}

function extractLatexSegments(text: string): string[] {
  return (text.match(/\$([^$]+)\$/g) ?? []).map((m) => m.slice(1, -1));
}

function allLatexCompiles(texts: string[]): boolean {
  for (const t of texts) {
    for (const seg of extractLatexSegments(t)) {
      try {
        katex.renderToString(seg, { throwOnError: true, strict: "ignore" });
      } catch {
        return false;
      }
    }
  }
  return true;
}

/** 구조 검증만 — A1(zod)/A3(mcq 선택지 중복)/A5(numeric 파싱)/A6(LaTeX) 성격. 실패면 폐기. */
function structurallyValid(item: MathGeneratedItem): boolean {
  if (!allLatexCompiles([item.contentText, item.solutionText])) return false;
  if (item.format === "mcq") {
    const seen = new Set(item.choices.map((c) => c.trim().toLowerCase()));
    return seen.size === item.choices.length;
  }
  return parseSpr(item.answerRaw).ok;
}

interface ReadyRow {
  item: MathGeneratedItem;
  unit: MathUnit;
}

async function submitAndWaitBatch(anthropic: Anthropic, units: MathUnit[], countPerUnit: number): Promise<string> {
  const requests: Anthropic.Messages.Batches.BatchCreateParams["requests"] = units.map((u) => ({
    custom_id: String(u.id),
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: MATH_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: buildMathUnitPrompt(u, countPerUnit) }],
    },
  }));

  console.log(`Batch API에 ${requests.length}건 제출 중…`);
  const batch = await anthropic.messages.batches.create({ requests });
  console.log(`Batch ID: ${batch.id} (상태: ${batch.processing_status})`);
  await waitForBatch(anthropic, batch.id, requests.length);
  return batch.id;
}

async function waitForBatch(anthropic: Anthropic, batchId: string, total: number) {
  let current = await anthropic.messages.batches.retrieve(batchId);
  while (current.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, 20_000));
    current = await anthropic.messages.batches.retrieve(batchId);
    console.log(
      `  진행 중… 완료 ${current.request_counts.succeeded + current.request_counts.errored}/${total}` +
        `(성공 ${current.request_counts.succeeded}, 실패 ${current.request_counts.errored})`
    );
  }
  console.log("Batch 완료.\n");
}

async function collectReadyRows(
  anthropic: Anthropic,
  batchId: string,
  unitById: Map<string, MathUnit>,
  countPerUnit: number
): Promise<{ readyRows: ReadyRow[]; generated: number; discarded: number }> {
  let generated = 0;
  let discarded = 0;
  const readyRows: ReadyRow[] = [];

  for await (const result of await anthropic.messages.batches.results(batchId)) {
    const unit = unitById.get(result.custom_id);
    if (!unit) continue;
    if (result.result.type !== "succeeded") {
      discarded += countPerUnit;
      continue;
    }
    const textBlock = result.result.message.content.find((b: Anthropic.Messages.ContentBlock) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      discarded += countPerUnit;
      continue;
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(stripTrailingCommas(extractJsonText(textBlock.text)));
    } catch {
      discarded += countPerUnit;
      continue;
    }
    const parsed = MathGeneratedBatchSchema.safeParse(parsedJson);
    if (!parsed.success) {
      discarded += countPerUnit;
      continue;
    }
    for (const item of parsed.data.items) {
      generated++;
      if (structurallyValid(item)) readyRows.push({ item, unit });
      else discarded++;
    }
  }
  return { readyRows, generated, discarded };
}

/** 단원 단위(생성과 같은 크기)로 쪼개서 순차 재검증 — 한 번에 몰아 보내면 응답이 잘린다. */
async function verifyByUnit(anthropic: Anthropic, rowsForUnit: ReadyRow[]): Promise<boolean[]> {
  const prompt = `Solve each problem below independently from scratch. Do not assume any given answer is correct.
For "mcq" items, answer with the 0-based index (0,1,2, or 3) of the correct choice.
For "numeric" items, answer with a single rational number as a string (e.g. "3/4", "-2.5", "12").

Problems:
${rowsForUnit
  .map(
    (r, i) =>
      `${i}. [${r.item.format}] ${r.item.contentText}` +
      (r.item.format === "mcq" ? `\n   choices: ${r.item.choices.map((c, ci) => `${ci}) ${c}`).join(", ")}` : "")
  )
  .join("\n\n")}

Return ONLY: [{"index": 0, "computedAnswer": "..."}]`;

  let computed = new Map<number, string>();
  try {
    // 2026-09-07 실사용 중 발견: 일반(비Batch) 호출이 이유 없이 응답을 40분 넘게 안 준 적이
    // 있었다(SDK 자체 재시도인지 네트워크 문제인지 불명) — 타임아웃 없이 기다리면 전체
    // 파이프라인이 멈추므로, 90초 넘으면 포기하고 이 단원만 검토 대기로 남긴다.
    const msg = await Promise.race([
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("verify timeout")), 90_000)),
    ]);
    const block = msg.content.find((b) => b.type === "text");
    if (block && block.type === "text") {
      const arr = JSON.parse(stripTrailingCommas(extractJsonText(block.text))) as { index: number; computedAnswer: string }[];
      computed = new Map(arr.map((r) => [r.index, String(r.computedAnswer)]));
    }
  } catch {
    // 타임아웃/파싱/호출 실패 — 이 단원 전부 unmatched(verified=false)로 남긴다.
  }

  return rowsForUnit.map(({ item }, i) => {
    const computedRaw = computed.get(i);
    if (computedRaw === undefined) return false;
    if (item.format === "mcq") {
      return Number(computedRaw) === item.correctIndex;
    }
    const a = parseSpr(item.answerRaw);
    const b = parseSpr(computedRaw);
    return a.ok && b.ok && a.value.n === b.value.n && a.value.d === b.value.d;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = serviceClient();

  const { data: allUnits, error: unitsErr } = await db
    .from("curriculum_units")
    .select("id, curriculum_group, curriculum_detail, unit_name")
    .eq("curriculum_detail", args.curriculumDetail)
    .not("unit_name", "ilike", "%코스워크%")
    .order("sort_order");
  if (unitsErr || !allUnits || allUnits.length === 0) {
    console.error("단원을 찾을 수 없습니다:", unitsErr?.message ?? "(0건)");
    process.exit(1);
  }
  const units = (args.unitLimit ? allUnits.slice(0, args.unitLimit) : allUnits) as MathUnit[];
  const unitById = new Map(units.map((u) => [String(u.id), u]));

  console.log(
    `수학 문항 생성 — curriculumDetail=${args.curriculumDetail} · 단원 ${units.length}개 × ${args.countPerUnit}문항${args.dryRun ? " (dry-run)" : ""}`
  );

  const anthropic = new Anthropic();
  const batchId = args.resumeBatchId ?? (await submitAndWaitBatch(anthropic, units, args.countPerUnit));
  if (args.resumeBatchId) {
    console.log(`기존 배치 재사용: ${batchId}`);
    await waitForBatch(anthropic, batchId, units.length);
  }

  const { readyRows, generated, discarded } = await collectReadyRows(anthropic, batchId, unitById, args.countPerUnit);
  console.log(`생성: ${generated} · 구조검증 통과: ${readyRows.length} · 폐기: ${discarded}`);

  if (readyRows.length === 0) {
    console.log("검증을 통과한 문항이 없습니다.");
    return;
  }

  // 단원별로 묶어서 순차 재검증(생성 단위와 동일하게 쪼갬 — 한 번에 몰아 보내면 응답이 잘림).
  console.log("독립 재검증 호출 중(단원별)…");
  const byUnit = new Map<number, ReadyRow[]>();
  for (const row of readyRows) {
    const list = byUnit.get(row.unit.id) ?? [];
    list.push(row);
    byUnit.set(row.unit.id, list);
  }

  const matchResults: boolean[] = new Array(readyRows.length).fill(false);
  let rowIdx = 0;
  const rowIndexByRow = new Map<ReadyRow, number>();
  for (const row of readyRows) rowIndexByRow.set(row, rowIdx++);

  let unitsDone = 0;
  for (const [unitId, rowsForUnit] of byUnit) {
    const startedAt = Date.now();
    console.log(`  [${unitsDone + 1}/${byUnit.size}] 단원 ${unitId}(${rowsForUnit[0].unit.unit_name}) 검증 시작…`);
    const results = await verifyByUnit(anthropic, rowsForUnit);
    rowsForUnit.forEach((row, i) => {
      matchResults[rowIndexByRow.get(row)!] = results[i];
    });
    unitsDone++;
    console.log(`  [${unitsDone}/${byUnit.size}] 완료 (${((Date.now() - startedAt) / 1000).toFixed(0)}초)`);
  }

  let verifiedTrue = 0;
  let verifiedFalse = 0;
  const insertRows = readyRows.map(({ item, unit }, i) => {
    const matches = matchResults[i];
    if (matches) verifiedTrue++;
    else verifiedFalse++;

    const answer = item.format === "mcq" ? LETTERS[item.correctIndex] : item.answerRaw;
    const choices = item.format === "mcq" ? item.choices : [];
    return {
      subject: "math",
      curriculum_group: unit.curriculum_group,
      curriculum_detail: unit.curriculum_detail,
      unit: unit.unit_name,
      difficulty: item.difficulty,
      problem_type: "text",
      image_url: "", // NOT NULL 컬럼 — 기존 텍스트형 문항 관례 그대로(빈 문자열)
      content_text: item.contentText,
      solution_text: item.solutionText,
      answer,
      choices,
      source: "ai",
      verified: matches,
    };
  });

  console.log(`재검증 결과 — 일치(verified=true): ${verifiedTrue} · 불일치(verified=false, 검토 대기): ${verifiedFalse}`);

  if (args.dryRun) {
    console.log("\n--dry-run 이라 DB에 삽입하지 않았습니다.");
    return;
  }

  const { error: insErr, count } = await db.from("problems").insert(insertRows, { count: "exact" });
  if (insErr) {
    console.error("삽입 실패:", insErr.message);
    process.exit(1);
  }
  console.log(`\n실제 삽입: ${count}건 (verified=true ${verifiedTrue} / verified=false ${verifiedFalse})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
