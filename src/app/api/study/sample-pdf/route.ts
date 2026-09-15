import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildProblemsHtml } from "@/lib/pdf/worksheet-html";
import { htmlToPdfBuffer } from "@/lib/pdf/generate";
import type { Problem, Worksheet } from "@/lib/problems";

// 서브메뉴(학년/과정) 페이지의 "PDF 샘플" — 단원 하나를 골라 문제 몇 개를 PDF로 보여준다
// (2026-09-15, 사용자 피드백: 화면에 텍스트로 쭉 나열하니 어수선함 → 기존 실전시험/PDF
// 시스템의 PDF 생성 로직(src/lib/pdf/worksheet-html.ts)을 재사용). 실제 worksheets 테이블에
// 행을 만들지 않고, 그 자리에서 만든 임시 Worksheet 객체 + 조회한 문제로 바로 PDF를 만든다
// (여러 단원 샘플마다 worksheets 행이 쌓이는 걸 막기 위해 — 어차피 매번 같은 문제로 재생성됨).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SAMPLE_COUNT = 5;

export const maxDuration = 60;

export async function GET(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const url = new URL(req.url);
  const curriculumDetail = url.searchParams.get("curriculumDetail");
  const unit = url.searchParams.get("unit");
  if (!curriculumDetail || !unit) return json(400, "올바르지 않은 요청입니다.");

  const db = createServiceClient();
  const { data: problems } = await db
    .from("problems")
    .select("*")
    .eq("curriculum_detail", curriculumDetail)
    .eq("unit", unit)
    .eq("verified", true)
    .order("created_at")
    .limit(SAMPLE_COUNT);

  if (!problems || problems.length === 0) return json(404, "이 단원은 아직 샘플 문제가 없습니다.");

  const worksheet: Worksheet = {
    id: "sample",
    title: `${curriculumDetail} · ${unit} 샘플문제`,
    description: null,
    subject: "math",
    is_exam: false,
    time_limit_minutes: null,
    created_at: new Date().toISOString(),
  };

  const html = buildProblemsHtml(worksheet, problems as Problem[]);
  const buffer = await htmlToPdfBuffer(html);
  const filename = `${unit.replace(/[^\w가-힣0-9-]+/g, "_")}_샘플.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
