/**
 * RUN_MATH_SITE.md 4-7: 외부 문항 JSON 배열 가져오기.
 *
 * zod로 형태를 검증한 뒤 problems에 그대로 넣는다 — verified는 입력값과 무관하게 항상 false,
 * source는 항상 'import'로 강제한다(승인은 5단계 관리자 화면에서, 검수 전 노출 금지).
 * unit_id/answer_format/answer_spec/is_auto_gradable은 여기서 채우지 않는다 — 기존
 * scripts/backfill-problem-answers.ts가 curriculum_group/curriculum_detail/unit 텍스트로
 * 정확매칭해 채우는 역할을 그대로 재사용한다(같은 파이프라인, 지시서 전역 금지사항: 테이블
 * 통합·새 매칭 로직 작성 금지).
 *
 * 사용법:
 *   npx tsx scripts/import-problems.ts <json파일경로>            (dry-run, 검증만)
 *   npx tsx scripts/import-problems.ts <json파일경로> --apply     (실제 삽입)
 *
 * JSON 형식: ImportProblemSchema 배열 하나.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
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

const ImportProblemSchema = z.object({
  curriculum_group: z.enum(["KR", "IB", "IGCSE", "CBSE", "AS_A_Level"]),
  curriculum_detail: z.string().min(1),
  unit: z.string().min(1),
  difficulty: z.enum(["하", "중", "상"]).default("중"),
  content_text: z.string().min(1),
  solution_text: z.string().optional(),
  answer: z.string().min(1),
  choices: z.array(z.string()).optional(),
  image_url: z.string().default(""), // NOT NULL 컬럼 — 관례대로 그림 없으면 빈 문자열(generate.ts와 동일)
  memo: z.string().optional(),
});
const ImportFileSchema = z.array(ImportProblemSchema);

async function main() {
  const filePath = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!filePath) {
    console.error("사용법: npx tsx scripts/import-problems.ts <json파일경로> [--apply]");
    process.exit(1);
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = ImportFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error(`형식 검증 실패 — ${parsed.error.issues.length}건:`);
    for (const issue of parsed.error.issues) {
      console.error(`  [${issue.path.join(".")}] ${issue.message}`);
    }
    process.exit(1);
  }

  const rows = parsed.data;
  console.log(`형식 검증 통과: ${rows.length}건`);
  const byUnit: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.curriculum_group}/${r.curriculum_detail}/${r.unit}`;
    byUnit[key] = (byUnit[key] ?? 0) + 1;
  }
  for (const [key, count] of Object.entries(byUnit)) {
    console.log(`  ${key}: ${count}건`);
  }

  if (!apply) {
    console.log("\n--apply 가 없어 dry-run으로 끝냅니다(DB 변경 없음).");
    return;
  }

  const db = serviceClient();
  const insertRows = rows.map((r) => ({
    subject: "math",
    curriculum_group: r.curriculum_group,
    curriculum_detail: r.curriculum_detail,
    unit: r.unit,
    difficulty: r.difficulty,
    problem_type: "text",
    image_url: r.image_url,
    content_text: r.content_text,
    solution_text: r.solution_text ?? null,
    answer: r.answer,
    choices: r.choices ?? [],
    memo: r.memo ?? null,
    source: "import",
    verified: false,
  }));

  const { error, count } = await db.from("problems").insert(insertRows, { count: "exact" });
  if (error) {
    console.error("삽입 실패:", error.message);
    process.exit(1);
  }
  console.log(`\n삽입 완료: ${count}건 (전부 verified=false — /admin/problems에서 검수 후 노출)`);
  console.log("unit_id/answer_format/answer_spec/is_auto_gradable 채우려면:");
  console.log("  npx tsx scripts/backfill-problem-answers.ts --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
