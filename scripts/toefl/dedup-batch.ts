/**
 * TOEFL 문항 중복검사 — 임베딩 생성(Gemini gemini-embedding-001, 1024차원) + 코사인 유사도
 * 기반 중복/유사 판정. 문항 파이프라인 지시서 Phase 3, [[toefl-item-pipeline-project]] 참고.
 * Phase 1 마이그레이션(202608281400)에서 toefl_item.embedding/dedup_status/duplicate_of를
 * 이미 만들어뒀다 — 이 스크립트는 그 컬럼을 채우고 판정만 한다.
 *
 * 두 단계로 나뉜다(따로 실행 가능):
 *   1) --embed  : embedding이 비어있는 활성 문항에 임베딩을 생성해 저장한다.
 *   2) --dedup  : 저장된 임베딩으로 같은 section+task_type 안에서만 코사인 유사도를 비교해
 *                 duplicate(자동 is_active=false)/near_duplicate(플래그만, 계속 노출)를 정한다.
 *                 임계값을 아직 실측으로 검증한 적이 없어서, --confirm 없이 돌리면 전체 유사도
 *                 분포(상위 페어)를 먼저 보여준다 — 그걸 보고 임계값을 조정한 뒤 --confirm.
 *
 * 지문 공유 유형(mcq_passage 계열: daily_life/academic_passage/conversation/announcement/
 * academic_talk) 주의(2026-08-31 실측으로 발견): 문항 하나가 아니라 **지문(stimulus)**이
 * 비교 단위다 — 같은 지문에 딸린 질문 여러 개(형제 문항)를 그대로 문항 단위로 비교하면
 * "같은 지문+다른 질문"이 전부 가짜 중복으로 잡힌다(실측: reading 180개 중 44%가 duplicate로
 * 잘못 잡혔는데 전부 형제 문항이었음). 그래서:
 *   - embed 단계: 지문이 있는 문항은 지문 텍스트만(문항 prompt 무시) 지문당 1번만 임베딩해서
 *     형제 문항 전부에 같은 벡터를 저장한다.
 *   - dedup 단계: 같은 stimulus_id를 가진 문항들을 "1 유닛"으로 묶어 비교하고, 판정은 그
 *     유닛의 모든 형제 문항에 함께 적용한다.
 * 지문이 없는 자기완결형 유형(complete_the_words, choose_a_response 등)은 문항 자체가
 * 비교 단위라 이 문제가 없다.
 *
 * 안전장치: 두 단계 다 --confirm 없이는 DB에 쓰지 않는다.
 *
 * 사용법:
 *   npx tsx scripts/toefl/dedup-batch.ts --embed [--section reading] [--confirm]
 *   npx tsx scripts/toefl/dedup-batch.ts --dedup [--section reading] [--dup-threshold 0.95] [--near-threshold 0.87] [--confirm]
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateEmbedding, cosineSimilarity } from "@/lib/toefl/server/embedding";
import { buildDedupText } from "@/lib/toefl/server/dedup-text";

// 2026-08-31 실측: reading 섹션에서 0.95는 "같은 주제 재사용, 다른 지문"까지 duplicate로
// 오판했다(예: "Urban Wildlife Adaptation" vs "Urban Expansion and Animal Adaptation",
// 0.9637 — 내용은 서로 다름). 사용자 결정으로 0.99로 올림 — 근거 없이 더 낮추지 말 것.
const DEFAULT_DUP_THRESHOLD = 0.99;
const DEFAULT_NEAR_THRESHOLD = 0.87;

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
  embed: boolean;
  dedup: boolean;
  section?: string;
  dupThreshold: number;
  nearThreshold: number;
  confirm: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    embed: argv.includes("--embed"),
    dedup: argv.includes("--dedup"),
    section: get("section"),
    dupThreshold: Number(get("dup-threshold") ?? DEFAULT_DUP_THRESHOLD),
    nearThreshold: Number(get("near-threshold") ?? DEFAULT_NEAR_THRESHOLD),
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

type ItemForEmbed = {
  id: string;
  task_type: string;
  prompt: string;
  payload: unknown;
  stimulus_id: string | null;
};

async function runEmbed(db: SupabaseClient, args: Args) {
  let query = db.from("toefl_item").select("id, task_type, prompt, payload, stimulus_id").eq("is_active", true).is("embedding", null);
  if (args.section) query = query.eq("section", args.section);
  const { data: items, error } = await query;
  if (error) {
    console.error("문항 조회 실패:", error.message);
    process.exit(1);
  }
  const rows = (items ?? []) as ItemForEmbed[];
  const withStimulus = rows.filter((r) => r.stimulus_id);
  const standalone = rows.filter((r) => !r.stimulus_id);
  const distinctStimulusIds = [...new Set(withStimulus.map((r) => r.stimulus_id as string))];
  console.log(
    `\n임베딩 없는 활성 문항: ${rows.length}개${args.section ? ` (section=${args.section})` : ""} ` +
      `— 지문공유 ${withStimulus.length}개(지문 ${distinctStimulusIds.length}종) + 자기완결형 ${standalone.length}개`
  );
  console.log(`Gemini 호출 예정 횟수: ${distinctStimulusIds.length + standalone.length}건(지문은 1개당 1번만, 형제 문항엔 같은 벡터 재사용)`);
  if (rows.length === 0) return;

  if (!args.confirm) {
    console.log("--confirm 이 없어 실제 Gemini 호출은 하지 않습니다.\n");
    return;
  }

  let saved = 0;
  let failed = 0;

  // 지문 공유 유형: 지문당 1번만 임베딩하고, 그 지문에 딸린 형제 문항 전부(이미 임베딩 있는
  // 것 포함해도 무해하지만 여기선 이번에 골라진 것만) 같은 벡터로 갱신한다.
  if (distinctStimulusIds.length > 0) {
    const { data: stimuli } = await db.from("toefl_stimulus").select("id, title, body, transcript").in("id", distinctStimulusIds);
    const stimulusById = new Map((stimuli ?? []).map((s) => [s.id, s]));
    for (const stimulusId of distinctStimulusIds) {
      const stim = stimulusById.get(stimulusId);
      const text = buildDedupText({ prompt: "", payload: null, stimulus: stim ? { title: stim.title, body: stim.body, transcript: stim.transcript } : null });
      const result = await generateEmbedding(text);
      if (!result.ok) {
        const memberCount = withStimulus.filter((r) => r.stimulus_id === stimulusId).length;
        failed += memberCount;
        console.log(`  · stimulus ${stimulusId}: 실패(형제 문항 ${memberCount}개 영향) — ${result.message}`);
        continue;
      }
      const { error: updateErr, count } = await db
        .from("toefl_item")
        .update({ embedding: result.values }, { count: "exact" })
        .eq("stimulus_id", stimulusId)
        .is("embedding", null);
      if (updateErr) {
        const memberCount = withStimulus.filter((r) => r.stimulus_id === stimulusId).length;
        failed += memberCount;
        console.log(`  · stimulus ${stimulusId}: 저장 실패 — ${updateErr.message}`);
        continue;
      }
      saved += count ?? 0;
    }
  }

  // 자기완결형 유형: 문항 하나가 곧 비교 단위이므로 그대로 개별 임베딩.
  for (const item of standalone) {
    const text = buildDedupText({ prompt: item.prompt, payload: item.payload, stimulus: null });
    const result = await generateEmbedding(text);
    if (!result.ok) {
      failed += 1;
      console.log(`  · ${item.id}(${item.task_type}): 실패 — ${result.message}`);
      continue;
    }
    const { error: updateErr } = await db.from("toefl_item").update({ embedding: result.values }).eq("id", item.id);
    if (updateErr) {
      failed += 1;
      console.log(`  · ${item.id}(${item.task_type}): 저장 실패 — ${updateErr.message}`);
      continue;
    }
    saved += 1;
  }

  console.log(`\n임베딩 저장 완료: ${saved}개 문항 성공, ${failed}개 실패.\n`);
}

type ItemForDedup = {
  id: string;
  task_type: string;
  section: string;
  stimulus_id: string | null;
  embedding: number[];
  dedup_status: string;
  duplicate_of: string | null;
  is_active: boolean;
  created_at: string;
};

/** 지문을 공유하는 형제 문항들을 "1 유닛"으로 묶는다 — dedup 비교와 판정 적용 둘 다 이 단위로 한다. */
type Unit = {
  key: string; // stimulus_id 또는 item id
  section: string;
  task_type: string;
  embedding: number[];
  createdAt: string;
  memberIds: string[]; // 판정을 적용할 실제 toefl_item id들(형제 전부)
  representativeId: string; // 리포트 출력용 대표 id
};

type Verdict = {
  unit: Unit;
  status: "unique" | "near_duplicate" | "duplicate";
  matchUnit: Unit | null;
  score: number | null;
};

function buildUnits(rows: ItemForDedup[]): Unit[] {
  const byStimulus = new Map<string, ItemForDedup[]>();
  const standalone: ItemForDedup[] = [];
  for (const r of rows) {
    if (r.stimulus_id) {
      (byStimulus.get(r.stimulus_id) ?? byStimulus.set(r.stimulus_id, []).get(r.stimulus_id)!).push(r);
    } else {
      standalone.push(r);
    }
  }
  const units: Unit[] = [];
  for (const [stimulusId, members] of byStimulus) {
    const sorted = [...members].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const rep = sorted[0];
    units.push({
      key: stimulusId,
      section: rep.section,
      task_type: rep.task_type,
      embedding: rep.embedding,
      createdAt: rep.created_at,
      memberIds: sorted.map((m) => m.id),
      representativeId: rep.id,
    });
  }
  for (const r of standalone) {
    units.push({
      key: r.id,
      section: r.section,
      task_type: r.task_type,
      embedding: r.embedding,
      createdAt: r.created_at,
      memberIds: [r.id],
      representativeId: r.id,
    });
  }
  return units;
}

async function runDedup(db: SupabaseClient, args: Args) {
  let query = db
    .from("toefl_item")
    .select("id, task_type, section, stimulus_id, embedding, dedup_status, duplicate_of, is_active, created_at")
    .eq("is_active", true)
    .not("embedding", "is", null);
  if (args.section) query = query.eq("section", args.section);
  const { data: items, error } = await query;
  if (error) {
    console.error("문항 조회 실패:", error.message);
    process.exit(1);
  }
  // PostgREST가 vector 컬럼을 네이티브 배열이 아니라 "[0.01,0.02,...]" 문자열로 돌려준다
  // (2026-08-31 실측 확인) — 그대로 쓰면 코사인 유사도가 전부 NaN이 된다.
  const rows = ((items ?? []) as (Omit<ItemForDedup, "embedding"> & { embedding: unknown })[]).map((r) => ({
    ...r,
    embedding: (typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding) as number[],
  }));
  console.log(`\n임베딩 있는 활성 문항: ${rows.length}개${args.section ? ` (section=${args.section})` : ""}`);
  if (rows.length === 0) {
    console.log("먼저 --embed 로 임베딩을 채워야 합니다.\n");
    return;
  }

  const units = buildUnits(rows);
  const withSiblings = units.filter((u) => u.memberIds.length > 1).length;
  console.log(`비교 단위: ${units.length}개(지문 공유로 묶인 유닛 ${withSiblings}개 포함)`);

  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const key = `${u.section}:${u.task_type}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(u);
  }

  const verdicts: Verdict[] = [];
  const allPairs: { a: Unit; b: Unit; score: number }[] = [];

  for (const [, groupUnits] of groups) {
    const sorted = [...groupUnits].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const kept: Unit[] = [];
    for (const unit of sorted) {
      if (kept.length === 0) {
        verdicts.push({ unit, status: "unique", matchUnit: null, score: null });
        kept.push(unit);
        continue;
      }
      let bestScore = -1;
      let bestMatch: Unit | null = null;
      for (const k of kept) {
        const score = cosineSimilarity(unit.embedding, k.embedding);
        allPairs.push({ a: unit, b: k, score });
        if (score > bestScore) {
          bestScore = score;
          bestMatch = k;
        }
      }
      if (bestScore >= args.dupThreshold) {
        verdicts.push({ unit, status: "duplicate", matchUnit: bestMatch, score: bestScore });
        // 중복은 kept 풀에 안 넣는다 — 뒤에 오는 유닛이 이미 숨겨질 유닛과 비교하지 않게.
      } else if (bestScore >= args.nearThreshold) {
        verdicts.push({ unit, status: "near_duplicate", matchUnit: bestMatch, score: bestScore });
        kept.push(unit);
      } else {
        verdicts.push({ unit, status: "unique", matchUnit: bestMatch, score: bestScore });
        kept.push(unit);
      }
    }
  }

  const dup = verdicts.filter((v) => v.status === "duplicate");
  const near = verdicts.filter((v) => v.status === "near_duplicate");
  const uniq = verdicts.filter((v) => v.status === "unique");
  const dupItemCount = dup.reduce((s, v) => s + v.unit.memberIds.length, 0);
  console.log(
    `\n판정 결과(임계값 duplicate>=${args.dupThreshold}, near_duplicate>=${args.nearThreshold}, 유닛 기준): ` +
      `duplicate ${dup.length}유닛/${dupItemCount}문항 · near_duplicate ${near.length}유닛 · unique ${uniq.length}유닛`
  );

  allPairs.sort((a, b) => b.score - a.score);
  console.log(`\n유사도 상위 20 페어(임계값과 무관하게 전체 분포 확인용, 유닛 기준):`);
  for (const p of allPairs.slice(0, 20)) {
    console.log(`  ${p.score.toFixed(4)}  ${p.a.section}/${p.a.task_type}  ${p.a.representativeId.slice(0, 8)} ↔ ${p.b.representativeId.slice(0, 8)}`);
  }

  if (dup.length > 0) {
    console.log(`\nduplicate 목록(유닛 대표 id → 판정, 형제 문항 수):`);
    for (const v of dup)
      console.log(
        `  ${v.score!.toFixed(4)}  ${v.unit.section}/${v.unit.task_type}  ${v.unit.representativeId}(형제 ${v.unit.memberIds.length}) → ${v.matchUnit!.representativeId}`
      );
  }
  if (near.length > 0) {
    console.log(`\nnear_duplicate 목록:`);
    for (const v of near)
      console.log(`  ${v.score!.toFixed(4)}  ${v.unit.section}/${v.unit.task_type}  ${v.unit.representativeId}(형제 ${v.unit.memberIds.length}) → ${v.matchUnit!.representativeId}`);
  }

  if (!args.confirm) {
    console.log(`\n--confirm 이 없어 DB는 그대로입니다. 위 분포를 보고 필요하면 --dup-threshold/--near-threshold를 조정해서 다시 돌려보세요.\n`);
    return;
  }

  let applied = 0;
  for (const v of verdicts) {
    const matchRepresentativeId = v.matchUnit?.representativeId ?? null;
    const update: Record<string, unknown> = { dedup_status: v.status, duplicate_of: matchRepresentativeId };
    if (v.status === "duplicate") update.is_active = false;
    const { error: updateErr } = await db.from("toefl_item").update(update).in("id", v.unit.memberIds);
    if (updateErr) {
      console.log(`  · ${v.unit.representativeId}: 갱신 실패 — ${updateErr.message}`);
      continue;
    }
    applied += v.unit.memberIds.length;
  }
  console.log(`\n적용 완료: 문항 ${applied}개 갱신(duplicate는 is_active=false로 자동 비활성화, 형제 문항 전체 포함).\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.embed && !args.dedup) {
    console.error("사용법: npx tsx scripts/toefl/dedup-batch.ts --embed|--dedup [--section <s>] [--confirm]");
    process.exit(1);
  }
  const db = serviceClient();
  if (args.embed) await runEmbed(db, args);
  if (args.dedup) await runDedup(db, args);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
