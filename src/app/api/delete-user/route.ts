import { createClient } from "@supabase/supabase-js";

// 계정 삭제(회원 탈퇴).
// auth 사용자 삭제는 service_role 키가 있어야 하므로 반드시 서버에서 처리한다.
// - 학생 본인: 자기 계정 삭제
// - 관리자: 다른 학생 계정 삭제 (targetUserId 지정)
// profiles 등 연결 데이터는 on delete cascade 로 함께 지워진다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");
  if (!SERVICE_KEY) return json(500, "계정 삭제가 아직 설정되지 않았습니다. (SUPABASE_SERVICE_ROLE_KEY 없음)");

  // 요청자 확인
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const body = (await req.json().catch(() => ({}))) as { targetUserId?: string };
  const target = body.targetUserId;

  // 삭제 권한을 정한다.
  let deleteId = auth.user.id; // 기본: 본인 탈퇴
  if (target && target !== auth.user.id) {
    const { data: me } = await asUser
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (me?.role === "owner" || me?.role === "admin") {
      // 최종관리자·관리자는 누구든 탈퇴시킬 수 있다.
    } else if (me?.role === "teacher") {
      // 교사는 담당 반(classes.teacher_id = 본인)의 학생만 탈퇴시킬 수 있다.
      const { data: targetProfile } = await asUser
        .from("profiles")
        .select("role, class_id")
        .eq("id", target)
        .maybeSingle();
      if (targetProfile?.role !== "student" || !targetProfile.class_id) {
        return json(403, "담당 반 학생만 탈퇴시킬 수 있습니다.");
      }
      const { data: myClass } = await asUser
        .from("classes")
        .select("id")
        .eq("id", targetProfile.class_id)
        .eq("teacher_id", auth.user.id)
        .maybeSingle();
      if (!myClass) return json(403, "담당 반 학생만 탈퇴시킬 수 있습니다.");
    } else {
      return json(403, "권한이 없습니다.");
    }
    deleteId = target;
  }

  // service_role 로 실제 삭제
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(deleteId);
  if (error) return json(502, `삭제에 실패했습니다: ${error.message}`);

  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
