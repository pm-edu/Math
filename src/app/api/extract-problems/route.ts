import { createClient } from "@supabase/supabase-js";

// PDF/이미지에서 문제를 추출한다 (Gemini).
// 관리자가 올린 이미지를 Gemini 에게 보내 "문제별로 나눠 JSON 으로" 받고,
// 그 결과를 화면에 돌려준다. (저장은 관리자가 검수 후 별도로 한다)
//
// 실제 저장/노출은 하지 않는다. 여기서는 "읽어서 구조화"만 한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";

type ExtractedProblem = {
  content_text: string;
  answer: string;
  unit: string;
  difficulty: string;
  problem_format: string;
};

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
  if (!["owner", "admin", "teacher", "assistant"].includes(me?.role ?? ""))
    return json(403, "권한이 없습니다.");

  if (!GEMINI_API_KEY) return json(500, "문제 추출이 아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  // 2) 업로드된 파일(이미지 또는 PDF)을 받는다
  const body = (await req.json().catch(() => ({}))) as {
    fileBase64?: string;
    mimeType?: string;
  };
  if (!body.fileBase64 || !body.mimeType) return json(400, "파일이 없습니다.");

  // 3) Gemini 에게 문제 추출을 요청한다
  const prompt = `이 이미지는 수학 문제지입니다. 담긴 문제를 하나씩 분리해서 추출해 주세요.
각 문제마다 다음 정보를 JSON 배열로 정리하세요. 반드시 JSON 만 출력하고 다른 설명은 넣지 마세요.

[
  {
    "content_text": "문제 본문. 수식은 LaTeX로. 예: 다음 방정식을 풀어라. $x^2 - 5x + 6 = 0$",
    "answer": "정답. 이미지에 정답이 있으면 그대로. 없으면 빈 문자열",
    "unit": "단원명 추정. 모르면 빈 문자열",
    "difficulty": "하/중/상 중 하나로 추정",
    "problem_format": "객관식/서술형/단답형 중 하나로 추정"
  }
]

주의: 정답을 직접 풀어서 만들지 마세요. 이미지에 적힌 정답만 옮기고, 없으면 비워두세요.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: body.mimeType, data: body.fileBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json(502, `추출에 실패했습니다: ${detail.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let problems: ExtractedProblem[] = [];
  try {
    problems = JSON.parse(raw);
    if (!Array.isArray(problems)) problems = [];
  } catch {
    return json(502, "추출 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }

  return Response.json({ ok: true, problems });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
