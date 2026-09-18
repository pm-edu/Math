import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireMathStaff } from "@/lib/math/server/auth";
import { detectDefects, type ScannableProblem } from "@/lib/math/problem-defects";

// RUN_MATH_SITE.md 6단계 B — /admin/study/worksheets의 "결함 의심" 필터가 부르는 라우트.
// scripts/scan-problems.ts와 같은 detectDefects()를 그대로 쓴다(기준을 두 곳에 안 둔다).

function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

interface ProblemRow extends ScannableProblem {
  unit: string | null;
  curriculum_detail: string | null;
  unit_id: string | null;
}

async function fetchAllScannable(db: SupabaseClient): Promise<ProblemRow[]> {
  const pageSize = 1000;
  const all: ProblemRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("problems")
      .select("id, content_text, image_url, solution_text, choices, answer_format, answer_spec, unit, curriculum_detail, unit_id")
      .eq("subject", "math")
      .eq("verified", true)
      .eq("is_auto_gradable", true)
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as ProblemRow[]));
    if (data.length < pageSize) break;
  }
  return all;
}

export async function GET(req: Request) {
  const auth = await requireMathStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const db = serviceClient();
  const problems = await fetchAllScannable(db);

  const { data: unitRows } = await db.from("curriculum_units").select("id, unit_name");
  const unitNameById = new Map((unitRows ?? []).map((u) => [u.id, u.unit_name]));

  const results = problems
    .map((p) => {
      const findings = detectDefects(p);
      if (findings.length === 0) return null;
      const unitLabel = (p.unit_id && unitNameById.get(p.unit_id)) || p.unit || p.curriculum_detail || "-";
      return {
        problemId: p.id,
        unit: unitLabel,
        snippet: (p.content_text ?? "").replace(/\s+/g, " ").slice(0, 80),
        findings,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return Response.json({ ok: true, total: problems.length, defectCount: results.length, results });
}
