import { createClient } from "@supabase/supabase-js";

// 트랙 페이지(/study/track/[key])의 "관심 등록" — student_programs 패턴(src/app/api/study/programs/route.ts)
// 그대로 복제: Bearer 토큰으로 본인 확인 후 service_role로 본인 student_id에만 upsert.
// student_curriculum_interest RLS는 staff 전용이라 학생 본인은 직접 insert할 수 없다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const VALID_TRACK_KEYS = ["elementary", "middle", "high", "ib", "igcse", "aslevel", "cbse"];

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

  const body = (await req.json().catch(() => ({}))) as { trackKey?: string };
  if (!body.trackKey || !VALID_TRACK_KEYS.includes(body.trackKey)) {
    return json(400, "올바르지 않은 과정입니다.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin
    .from("student_curriculum_interest")
    .upsert({ student_id: auth.user.id, track_key: body.trackKey }, { onConflict: "student_id,track_key", ignoreDuplicates: true });

  if (error) return json(502, "관심 등록에 실패했습니다.");
  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
