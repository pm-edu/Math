import { createClient } from "@supabase/supabase-js";

// 온보딩(관심 과목 선택)에서 student_programs에 status='interested' 행을 넣는다.
// student_programs는 접근권이 아니라 헤더 메뉴 노출용 관심 표시일 뿐이지만, RLS 정책
// 자체는(supabase/migrations/202608281300_student_programs.sql) staff 전용이라 학생 본인이
// 직접 insert할 방법이 없다 — RUN_SIGNUP.md S4 지시대로 RLS는 안 건드리고, 여기서
// Bearer 토큰으로 본인 확인만 한 뒤 service_role로 "본인 student_id"에만 기록한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const VALID_PROGRAMS = ["math", "sat", "toefl"];

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");
  if (!SERVICE_KEY) return json(500, "설정이 아직 안 됐습니다. (SUPABASE_SERVICE_ROLE_KEY 없음)");

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const body = (await req.json().catch(() => ({}))) as { programs?: string[] };
  const programs = (body.programs ?? []).filter((p) => VALID_PROGRAMS.includes(p));
  if (programs.length === 0) return json(400, "과목을 하나 이상 선택해주세요.");

  // 이미 staff가 active/paused/ended로 지정해둔 행은 그대로 두고(덮어쓰지 않음),
  // 없는 program만 interested로 새로 넣는다.
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin
    .from("student_programs")
    .upsert(
      programs.map((program) => ({ student_id: auth.user.id, program, status: "interested" })),
      { onConflict: "student_id,program", ignoreDuplicates: true }
    );

  if (error) return json(502, "관심 과목을 저장하지 못했습니다.");
  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
