import { createServiceClient } from "@/lib/supabase/service";

// 수신거부 확정 — /unsubscribe 페이지의 버튼이 이 라우트를 호출한다.
// GET이 아니라 POST로 받는다: 메일 보안 스캐너(Outlook Safe Links 등)가 링크를 미리
// 열어보기만 해도 자동으로 수신거부되는 사고를 막기 위함(GET은 부작용이 없어야 함).

type Body = { token?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const token = body.token?.trim();
  if (!token) return json(400, "잘못된 요청입니다.");

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("mailing_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("email")
    .maybeSingle();

  if (error) return json(500, "처리 중 문제가 발생했습니다.");
  if (!data) return json(404, "이미 처리되었거나 존재하지 않는 링크입니다.");

  return Response.json({ ok: true, email: data.email });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
