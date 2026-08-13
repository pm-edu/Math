import { createClient } from "@supabase/supabase-js";

// 단어 활용 문장 작성 연습(SENTENCE_WRITE) 채점. 마스터리 사다리·FSRS와는 무관한
// 별도 연습 도구다 — AI 판단 오류가 학습 진도에 영향을 주지 않도록 결과를 저장하지 않는다.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";
const MAX_SENTENCE_LENGTH = 200;

export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  if (!GEMINI_API_KEY) return json(500, "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)");

  const body = (await req.json().catch(() => ({}))) as {
    lemma?: string;
    meaning?: string;
    sentence?: string;
  };
  const lemma = (body.lemma ?? "").trim();
  const meaning = (body.meaning ?? "").trim();
  const sentence = (body.sentence ?? "").trim();

  if (!lemma || !sentence) return json(400, "단어와 문장이 필요합니다.");
  if (sentence.length > MAX_SENTENCE_LENGTH) return json(400, "문장이 너무 깁니다.");

  const prompt = `당신은 한국 중고등학생에게 영어를 가르치는 선생님입니다.
학생이 단어 "${lemma}"${meaning ? `(뜻: ${meaning})` : ""}를 사용해 아래 문장을 썼습니다.

문장: "${sentence}"

이 문장이 (1) 문법적으로 크게 어색하지 않고 (2) "${lemma}"를 올바른 의미로 자연스럽게 썼는지 판단하세요.
사소한 오타나 어색함은 있어도 의미 전달이 되면 correct=true로 판단하세요(너무 엄격하게 채점하지 마세요).

아래 JSON 형식으로만 답하세요. 다른 텍스트는 절대 포함하지 마세요.
{"correct": true 또는 false, "feedback": "한국어로 1~2문장. 잘했으면 칭찬, 틀렸으면 무엇이 어색한지와 고친 문장 예시"}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return json(502, `채점 실패: ${detail.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const raw = (geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "") as string;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let parsed: { correct?: boolean; feedback?: string } = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return json(502, "채점 결과를 읽지 못했습니다. 다시 시도해주세요.");
  }
  if (typeof parsed.correct !== "boolean" || !parsed.feedback) {
    return json(502, "채점 결과 형식이 올바르지 않습니다. 다시 시도해주세요.");
  }

  return Response.json({ ok: true, correct: parsed.correct, feedback: parsed.feedback });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
