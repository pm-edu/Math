import { createClient } from "@supabase/supabase-js";

// 문제의 풀이(해설) "초안"을 Gemini로 만들어 돌려준다.
// 저장은 하지 않는다 — 관리자가 화면에서 검수·수정 후 직접 저장(승인)한다.
// 즉, AI가 만든 풀이는 관리자가 저장 버튼을 눌러야만 학생에게 노출된다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";

export async function POST(req: Request) {
  // 1) 관리자 확인
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (me?.role !== "admin") return json(403, "관리자만 사용할 수 있습니다.");

  if (!GEMINI_API_KEY) return json(500, "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    content_text?: string;
    image_url?: string;
    answer?: string;
    problem_format?: string;
  };

  const prompt = `당신은 수학 선생님입니다. 아래 문제의 풀이(해설)를 한국어로 작성하세요.
- 학생이 이해하도록 단계별로 설명합니다.
- 수식은 반드시 LaTeX로 쓰고 $ ... $ 로 감쌉니다. (예: $x^2 - 5x + 6 = 0$)
- 마지막에 "따라서 답은 ..." 형태로 최종 답을 제시합니다.
${body.answer ? `- 정답은 "${body.answer}" 입니다. 이 정답이 나오도록 풀이하고 검산하세요.` : "- 정답이 주어지지 않았으니 직접 풀되, 계산 실수에 주의하세요."}
- 풀이 본문만 출력하고 다른 군더더기 설명은 넣지 마세요.

주의: 이 풀이는 초안입니다. 관리자가 검수합니다.`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (body.content_text?.trim()) {
    parts.push({ text: `문제: ${body.content_text}` });
  }
  if (body.image_url?.trim()) {
    try {
      const imgRes = await fetch(body.image_url);
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mime = imgRes.headers.get("content-type") ?? "image/png";
        parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } });
      }
    } catch {
      // 이미지 못 가져와도 텍스트만으로 시도
    }
  }

  if (parts.length === 1) {
    return json(400, "문제 내용이 없습니다. (본문 텍스트나 이미지가 필요합니다)");
  }

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json(502, `풀이 생성 실패: ${detail.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const solution = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!solution.trim()) return json(502, "풀이를 만들지 못했습니다. 다시 시도해주세요.");

  return Response.json({ ok: true, solution });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
