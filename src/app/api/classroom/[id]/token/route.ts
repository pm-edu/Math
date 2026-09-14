import { createClient } from "@supabase/supabase-js";
import { AccessToken } from "livekit-server-sdk";
import { isStaff } from "@/lib/roles";

// 강의실 입장용 LiveKit 토큰 발급. 선생님(staff)은 아무 강의실이나, 학생은 배정된
// 강의실(classroom_participants에 자기 행이 있는 경우)만 발급받을 수 있다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const { data: me } = await supabase.from("profiles").select("role, name").eq("id", auth.user.id).maybeSingle();
  const staff = isStaff(me?.role);

  const { data: session } = await supabase
    .from("classroom_sessions")
    .select("id, title, livekit_room, teacher_id")
    .eq("id", id)
    .maybeSingle();
  if (!session) return json(404, "강의실을 찾을 수 없습니다.");

  if (!staff) {
    const { data: participant } = await supabase
      .from("classroom_participants")
      .select("id")
      .eq("session_id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (!participant) return json(403, "배정되지 않은 강의실입니다.");
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return json(500, "화상 강의실이 아직 설정되지 않았습니다. (LIVEKIT_API_KEY/SECRET 없음)");

  const at = new AccessToken(apiKey, apiSecret, {
    identity: auth.user.id,
    name: me?.name ?? auth.user.email ?? "참가자",
  });
  at.addGrant({
    room: session.livekit_room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // 입장 시각 기록(배정된 행이 있을 때만 — staff가 배정 없이 들어온 경우는 기록 안 함).
  await supabase
    .from("classroom_participants")
    .update({ joined_at: new Date().toISOString() })
    .eq("session_id", id)
    .eq("user_id", auth.user.id);

  const jwt = await at.toJwt();
  return Response.json({
    ok: true,
    token: jwt,
    room: session.livekit_room,
    title: session.title,
    isTeacher: auth.user.id === session.teacher_id,
    livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "",
  });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
