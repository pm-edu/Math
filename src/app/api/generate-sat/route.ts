import { createClient } from "@supabase/supabase-js";

// SAT(Reading & Writing) 형식의 영어 객관식 문제를 Gemini로 생성한다.
// 저장은 하지 않는다 — 관리자가 화면에서 검수·수정 후 직접 저장한다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";

export async function POST(req: Request) {
  // 관리자/직원 확인
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

  if (!GEMINI_API_KEY) return json(500, "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    count?: number;
    skill?: string;
    difficulty?: string;
    topic?: string;
  };
  const count = Math.min(Math.max(body.count ?? 5, 1), 10);
  const skill = body.skill?.trim() || "Reading and Writing (mixed)";
  const difficulty = body.difficulty?.trim() || "medium";

  const prompt = `You are an expert SAT test writer. Create ${count} original Digital SAT "Reading and Writing" style multiple-choice questions.
Focus skill: ${skill}. Difficulty: ${difficulty}.${body.topic ? ` Topic/theme: ${body.topic}.` : ""}

Rules:
- Each question is self-contained: a short passage (1-5 sentences) followed by ONE question.
- Exactly 4 answer choices.
- Exactly ONE correct answer.
- Provide a concise explanation of why the answer is correct.
- Natural, exam-realistic English. Do NOT reuse real copyrighted passages; write original text.

Return ONLY a JSON array, no other text, in this exact shape:
[
  {
    "passage": "the short passage text",
    "question": "the question stem",
    "choices": ["choice A text", "choice B text", "choice C text", "choice D text"],
    "answer": "A",
    "explanation": "why this answer is correct",
    "skill": "the specific skill tested",
    "difficulty": "easy | medium | hard"
  }
]`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json(502, `생성 실패: ${detail.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let problems: unknown[] = [];
  try {
    problems = JSON.parse(raw);
    if (!Array.isArray(problems)) problems = [];
  } catch {
    return json(502, "생성 결과를 해석하지 못했습니다. 다시 시도해주세요.");
  }

  return Response.json({ ok: true, problems });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
