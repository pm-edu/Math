import { createClient } from "@supabase/supabase-js";
import { jsonError, requireCronSecret } from "@/lib/math/server/auth";

// 수학 학습 진행 구조 PG5 5-2: 매일 복습 도래 알림. Vercel Cron이 호출한다(vercel.json).
// 메일 발송 패턴은 src/app/api/send-mail/route.ts(Resend REST 직접 호출)와 동일하게 맞췄다.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const MAIL_FROM = process.env.MAIL_FROM ?? "PM EDU <noreply@pmedu4u.com>";
const STUDY_URL = "https://pmedu4u.com/study";

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export async function GET(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  if (!RESEND_API_KEY) return jsonError(500, "메일 발송이 아직 설정되지 않았습니다. (RESEND_API_KEY 없음)");

  const db = serviceClient();
  const { data: due, error: dueErr } = await db.from("v_math_review_queue").select("user_id, unit_name");
  if (dueErr) return jsonError(500, `복습 대상 조회 실패: ${dueErr.message}`);
  if (!due || due.length === 0) return Response.json({ ok: true, sent: 0, dueUsers: 0 });

  const unitsByUser = new Map<string, string[]>();
  for (const row of due) {
    const list = unitsByUser.get(row.user_id) ?? [];
    list.push(row.unit_name);
    unitsByUser.set(row.user_id, list);
  }

  const { data: profiles } = await db
    .from("profiles")
    .select("id, email")
    .in("id", Array.from(unitsByUser.keys()));
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email as string | null]));

  let sent = 0;
  for (const [userId, unitNames] of unitsByUser) {
    const email = emailById.get(userId);
    if (!email) continue;

    const html = `
      <p>복습할 때가 된 단원이 있어요:</p>
      <ul>${unitNames.map((name) => `<li>${name}</li>`).join("")}</ul>
      <p><a href="${STUDY_URL}">지금 복습하러 가기</a></p>
    `;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: email, subject: "복습할 시간이에요", html }),
    });
    if (res.ok) sent++;
  }

  return Response.json({ ok: true, sent, dueUsers: unitsByUser.size });
}
