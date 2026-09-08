import { createServiceClient } from "@/lib/supabase/service";

// 무료 구독(이메일만 등록, 계정 불필요) — 로그인 없는 공개 폼에서 호출한다.
// 이미 등록된 이메일이 다시 신청하면 수신거부 상태만 풀어준다(unsubscribe_token은 유지).

type Body = { email?: string; name?: string; subject?: "math" | "english" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() || null;
  const subject = body.subject === "english" ? "english" : "math";

  if (!email || !EMAIL_RE.test(email)) return json(400, "올바른 이메일 주소를 입력해주세요.");

  const admin = createServiceClient();
  const { error } = await admin
    .from("mailing_subscribers")
    .upsert({ email, name, subject, unsubscribed_at: null }, { onConflict: "email" });

  if (error) return json(500, "구독 신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
  return Response.json({ ok: true });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
