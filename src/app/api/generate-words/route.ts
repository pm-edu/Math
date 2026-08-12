import { createClient } from "@supabase/supabase-js";

// 영어 단어를 Gemini로 생성한다 (단어·뜻·품사·예문·예문뜻·레벨).
// 저장은 하지 않는다 — 관리자가 화면에서 검수·수정 후 직접 저장한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["owner", "admin", "teacher", "assistant"].includes(me?.role ?? ""))
    return json(403, "권한이 없습니다.");

  if (!GEMINI_API_KEY) return json(500, "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    count?: number;
    tag?: string;
    level?: number;
    topic?: string;
    exclude?: string[];
  };
  const count = Math.min(Math.max(body.count ?? 10, 1), 30);
  const tag = body.tag?.trim() || "general";
  const level = body.level ?? 2;
  const levelWord = level === 1 ? "easy/basic" : level === 3 ? "advanced/difficult" : "intermediate";
  const excludeList = (body.exclude ?? []).slice(0, 300);

  const prompt = `Generate ${count} English vocabulary words for study${tag !== "general" ? ` targeting the ${tag} exam` : ""}.
Difficulty: ${levelWord}.${body.topic ? ` Topic/theme: ${body.topic}.` : ""}
${excludeList.length ? `Do NOT include any of these words: ${excludeList.join(", ")}.` : ""}

For each word provide:
- word: the English word
- meaning: its meaning in Korean (한국어 뜻), concise
- part_of_speech: e.g. n., v., adj., adv.
- example: a natural English example sentence using the word
- example_ko: the Korean translation of that example sentence

Return ONLY a JSON array, no other text:
[
  { "word": "...", "meaning": "...", "part_of_speech": "...", "example": "...", "example_ko": "..." }
]`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, responseMimeType: "application/json" },
      }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json(502, `생성 실패: ${detail.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let words: unknown[] = [];
  try {
    words = JSON.parse(raw);
    if (!Array.isArray(words)) words = [];
  } catch {
    return json(502, "생성 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }

  return Response.json({ ok: true, words });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
