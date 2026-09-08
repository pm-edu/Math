import { createClient } from "@supabase/supabase-js";

// 실전 시험 응시 시작 — 시작 시각을 서버에 기록한다.
// 클라이언트 시계로만 타이머를 재면 시계를 바꿔 시간을 늘릴 수 있어서, 여기서 기록한
// started_at 을 기준으로 학생 화면이 남은 시간을 계산한다. 이미 제출을 마친 학생은 거부한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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

  // RLS: 자기에게 배포된 문제지만 조회된다 — 배포 안 됐으면 자연스럽게 404.
  const { data: ws } = await asUser
    .from("worksheets")
    .select("id, is_exam, time_limit_minutes")
    .eq("id", worksheetId)
    .maybeSingle();
  if (!ws) return json(404, "문제지를 찾을 수 없습니다.");
  if (!ws.is_exam) return json(400, "실전 시험 문제지가 아닙니다.");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 이미 시작 기록이 있으면 그 시각을 그대로 쓴다(새로고침해도 타이머 유지).
  await admin
    .from("worksheet_attempts")
    .insert({ worksheet_id: worksheetId, user_id: auth.user.id })
    .select("id")
    .maybeSingle(); // unique 제약 위반(이미 있음)은 무시하고 아래에서 다시 조회한다.

  const { data: attempt, error: attErr } = await admin
    .from("worksheet_attempts")
    .select("started_at, submitted_at")
    .eq("worksheet_id", worksheetId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (attErr || !attempt) return json(500, "응시 시작에 실패했습니다.");
  if (attempt.submitted_at) return json(403, "이미 이 시험에 응시했습니다. 다시 응시할 수 없습니다.");

  return Response.json({
    ok: true,
    startedAt: attempt.started_at,
    timeLimitMinutes: ws.time_limit_minutes,
  });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
