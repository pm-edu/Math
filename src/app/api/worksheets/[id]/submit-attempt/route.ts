import { createClient } from "@supabase/supabase-js";
import { normAnswer } from "@/lib/grading";

// 실전 시험 제출 — 채점까지 서버에서 한다(클라이언트가 정답 여부를 조작해 보낼 수 없도록).
// 이미 제출한 시도는 다시 받지 않는다(1회 응시 강제, start-attempt 와 쌍을 이룸).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type Body = { answers?: Record<string, string> };

function gradeOne(answer: string | null, format: string | null, given: string): boolean | null {
  if (!answer) return null;
  if (format === "서술형") return null;
  return normAnswer(given) === normAnswer(answer);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: worksheetId } = await params;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");
  if (!SERVICE_KEY) return json(500, "서버 설정이 완료되지 않았습니다.");

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const { data: ws } = await asUser.from("worksheets").select("id, is_exam").eq("id", worksheetId).maybeSingle();
  if (!ws) return json(404, "문제지를 찾을 수 없습니다.");
  if (!ws.is_exam) return json(400, "실전 시험 문제지가 아닙니다.");

  const body = (await req.json().catch(() => ({}))) as Body;
  const answers = body.answers ?? {};

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: attempt } = await admin
    .from("worksheet_attempts")
    .select("id, submitted_at")
    .eq("worksheet_id", worksheetId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!attempt) return json(400, "응시 시작 기록이 없습니다. 처음부터 다시 시작해주세요.");
  if (attempt.submitted_at) return json(403, "이미 제출했습니다. 다시 제출할 수 없습니다.");

  const { data: wp } = await admin
    .from("worksheet_problems")
    .select("position, problem:problems(id, answer, problem_format)")
    .eq("worksheet_id", worksheetId)
    .order("position");

  type ProblemRow = { id: string; answer: string | null; problem_format: string | null };
  const problems = (wp ?? [])
    .flatMap((r) => {
      const p = (r as { problem: ProblemRow | ProblemRow[] | null }).problem;
      return Array.isArray(p) ? p : p ? [p] : [];
    });

  const results: Record<string, boolean | null> = {};
  const rows = problems.map((p) => {
    const given = (answers[p.id] ?? "").trim();
    const isCorrect = gradeOne(p.answer, p.problem_format, given);
    results[p.id] = isCorrect;
    return {
      user_id: auth.user!.id,
      problem_id: p.id,
      worksheet_id: worksheetId,
      submitted_answer: given || null,
      is_correct: isCorrect,
    };
  });

  if (rows.length > 0) {
    const { error: subErr } = await admin
      .from("problem_submissions")
      .upsert(rows, { onConflict: "user_id,problem_id,worksheet_id" });
    if (subErr) return json(500, `제출 저장에 실패했습니다: ${subErr.message}`);
  }

  await admin
    .from("worksheet_attempts")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", attempt.id);

  const gradable = problems.filter((p) => results[p.id] !== null);
  const correctCount = gradable.filter((p) => results[p.id] === true).length;

  return Response.json({ ok: true, results, correctCount, gradableCount: gradable.length });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
