/**
 * RUN_MATH_SITE.md 2단계 C-4 — 기존 학생 전원에게 entitlement_grants를 채운다.
 * entitlement.ts가 이제 실제로 판정하므로(2026-09-17 이전엔 전면 허용 자리표시자였음),
 * 이걸 --apply로 적용하지 않고 배포하면 현재 학생 전원이 /study 접근이 막힌다 — 배포 순서 주의.
 *
 * 대상: role='student' 전원. class_id 있으면 'math.lecture', 없으면 'math.subscription'.
 * 기본은 dry-run(대상 수만 출력, DB 안 건드림). --apply 플래그가 있어야 실제 INSERT.
 *
 * 사용법:
 *   npx tsx scripts/backfill-entitlements.ts            (dry-run)
 *   npx tsx scripts/backfill-entitlements.ts --apply     (실제 반영)
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

const NOTE = "backfill-2026-09";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = serviceClient();

  const { data: students, error } = await db.from("profiles").select("id, class_id").eq("role", "student");
  if (error) {
    console.error("학생 목록 조회 실패:", error.message);
    process.exit(1);
  }

  const rows = (students ?? []).map((s) => ({
    user_id: s.id,
    feature_key: s.class_id ? ("math.lecture" as const) : ("math.subscription" as const),
    note: NOTE,
  }));
  const lectureCount = rows.filter((r) => r.feature_key === "math.lecture").length;
  const subscriptionCount = rows.length - lectureCount;

  console.log(`대상 학생: ${rows.length}명 (math.lecture ${lectureCount} / math.subscription ${subscriptionCount})`);

  if (!apply) {
    console.log("--apply 가 없어 dry-run으로 끝냅니다(DB 변경 없음).");
    return;
  }

  // 이미 같은 (user_id, feature_key) grant가 있으면 중복으로 또 넣지 않는다(재실행 안전).
  const { data: existing } = await db.from("entitlement_grants").select("user_id, feature_key").is("revoked_at", null);
  const existingKeys = new Set((existing ?? []).map((g) => `${g.user_id}:${g.feature_key}`));
  const toInsert = rows.filter((r) => !existingKeys.has(`${r.user_id}:${r.feature_key}`));

  if (toInsert.length === 0) {
    console.log("이미 전부 부여돼 있습니다. 추가로 넣을 게 없습니다.");
    return;
  }

  const { error: insertError } = await db.from("entitlement_grants").insert(toInsert);
  if (insertError) {
    console.error("부여 실패:", insertError.message);
    process.exit(1);
  }
  console.log(`${toInsert.length}건 부여 완료(기존 ${rows.length - toInsert.length}건은 이미 있어서 건너뜀).`);
}

main();
