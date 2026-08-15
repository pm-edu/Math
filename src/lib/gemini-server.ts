// 서버(API route) 전용 Gemini 호출 헬퍼.
// Gemini가 "지금 사용량이 많다"(503 UNAVAILABLE)고 일시적으로 거절하는 경우가 종종 있어서,
// 그럴 때는 잠깐 기다렸다가 자동으로 다시 시도한다(관리자가 매번 버튼을 다시 누를 필요 없게).

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const MODEL = "gemini-flash-latest";

export type GeminiPart = Record<string, unknown>;
export type GeminiResult = { ok: true; text: string } | { ok: false; status: number; message: string };

const RETRYABLE_STATUS = new Set([503, 429]);
const RETRY_DELAYS_MS = [2000, 4000]; // 1차 실패 후 2초, 2차 실패 후 4초 대기 (총 3번 시도)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini(
  parts: GeminiPart[],
  options: { temperature?: number; json?: boolean } = {}
): Promise<GeminiResult> {
  if (!GEMINI_API_KEY) return { ok: false, status: 500, message: "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)" };

  let lastMessage = "";
  let lastStatus = 502;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            ...(options.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { ok: true, text };
    }

    lastMessage = await res.text();
    lastStatus = res.status;

    const canRetry = RETRYABLE_STATUS.has(res.status) && attempt < RETRY_DELAYS_MS.length;
    if (!canRetry) break;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  return { ok: false, status: lastStatus, message: lastMessage.slice(0, 200) };
}
