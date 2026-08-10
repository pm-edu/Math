import { createClient } from "@supabase/supabase-js";

// 관리자가 학생들에게 메일을 보내는 경로.
// 발송은 반드시 서버에서 한다 — Resend API 키가 브라우저에 노출되면 안 되고,
// 요청자가 관리자인지도 서버에서 확인해야 하기 때문이다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const MAIL_FROM = process.env.MAIL_FROM ?? "수학클래스 <noreply@send.pmedu4u.com>";

type Body = {
  subject?: string;
  html?: string;
  target?: "all" | "course" | "selected";
  courseId?: string;
  userIds?: string[];
};

export async function POST(req: Request) {
  // 1) 요청자 확인 — 브라우저가 보낸 로그인 토큰으로 사용자를 특정한다.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  // 2) 관리자인지 확인
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (me?.role !== "admin") return json(403, "관리자만 보낼 수 있습니다.");

  if (!RESEND_API_KEY) return json(500, "메일 발송이 아직 설정되지 않았습니다. (RESEND_API_KEY 없음)");

  const body = (await req.json()) as Body;
  const subject = body.subject?.trim();
  const html = body.html?.trim();
  if (!subject || !html) return json(400, "제목과 내용을 입력해주세요.");

  // 3) 받는 사람 목록을 만든다. (관리자 정책 덕분에 전체 profiles 조회 가능)
  let recipients: string[] = [];

  if (body.target === "course" && body.courseId) {
    const { data } = await supabase
      .from("purchases")
      .select("user_id")
      .eq("course_id", body.courseId)
      .eq("status", "paid");
    const ids = (data ?? []).map((r) => r.user_id);
    if (ids.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("email").in("id", ids);
      recipients = (profs ?? []).map((r) => r.email).filter((e): e is string => !!e);
    }
  } else if (body.target === "selected" && body.userIds?.length) {
    const { data } = await supabase
      .from("profiles")
      .select("email")
      .in("id", body.userIds);
    recipients = (data ?? []).map((r) => r.email).filter((e): e is string => !!e);
  } else {
    const { data } = await supabase.from("profiles").select("email");
    recipients = (data ?? []).map((r) => r.email).filter((e): e is string => !!e);
  }

  // 중복 제거
  recipients = [...new Set(recipients)];
  if (recipients.length === 0) return json(400, "받는 사람이 없습니다.");

  // 4) Resend 로 발송. 받는 사람은 BCC 로 넣어 서로 주소가 보이지 않게 한다.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: MAIL_FROM, // 대표 주소로 보내고 실제 수신자는 bcc
      bcc: recipients,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json(502, `발송에 실패했습니다: ${detail.slice(0, 200)}`);
  }

  return Response.json({ ok: true, count: recipients.length });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
