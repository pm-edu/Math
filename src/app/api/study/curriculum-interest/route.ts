import { createClient } from "@supabase/supabase-js";
import { TRACK_KEYS, detailValuesForTrack, type TrackKey } from "@/lib/home/trackAvailability";

// 서브메뉴(학년/과정) 페이지(/study/track/[key]/[detail])의 "신청" — student_programs 패턴
// (src/app/api/study/programs/route.ts) 그대로 복제: Bearer 토큰으로 본인 확인 후 service_role로
// 본인 student_id에만 upsert. student_curriculum_interest RLS는 staff 전용이라 학생 본인은
// 직접 insert할 수 없다. status는 DB 기본값 'pending' — 관리자가 승인/거절한다(즉시 학습 진입 아님,
// 2026-09-15 사용자 피드백: "구독형이라 데이터를 제공하는 것이지 시험을 보는 게 아니다").

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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

  const body = (await req.json().catch(() => ({}))) as { trackKey?: string; curriculumDetail?: string };
  if (!body.trackKey || !TRACK_KEYS.includes(body.trackKey as TrackKey)) {
    return json(400, "올바르지 않은 과정입니다.");
  }
  const validDetails = detailValuesForTrack(body.trackKey as TrackKey);
  if (!body.curriculumDetail || !validDetails.includes(body.curriculumDetail)) {
    return json(400, "올바르지 않은 학년/과정입니다.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.from("student_curriculum_interest").upsert(
    { student_id: auth.user.id, track_key: body.trackKey, curriculum_detail: body.curriculumDetail },
    { onConflict: "student_id,curriculum_detail", ignoreDuplicates: true }
  );

  if (error) return json(502, "신청에 실패했습니다.");
  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
