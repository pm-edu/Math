// 서버(API route) 전용 Gemini 호출 헬퍼.
// Gemini가 "지금 사용량이 많다"(503 UNAVAILABLE)고 일시적으로 거절하는 경우가 종종 있어서,
// 그럴 때는 잠깐 기다렸다가 자동으로 다시 시도한다(관리자가 매번 버튼을 다시 누를 필요 없게).

const MODEL = "gemini-flash-latest";

export type GeminiPart = Record<string, unknown>;
export type GeminiResult = { ok: true; text: string } | { ok: false; status: number; message: string };

/**
 * 200 OK 응답 안에서 실패를 골라낸다.
 *
 * Gemini는 출력이 길이 제한에 걸려 중간에 끊겨도 200을 준다(finishReason: MAX_TOKENS).
 * 그러면 잘린 JSON이 그대로 넘어가 "JSON으로 해석하지 못했습니다"로만 보이고, 원인이
 * "모델이 말을 다 못 끝냈다"는 사실은 어디에도 안 나온다 — 문항 개수를 늘렸을 때
 * 갑자기 실패하는 전형적인 이유다. 안전차단(SAFETY)도 같은 방식으로 200으로 온다.
 *
 * 순수 함수로 떼어놨다(테스트 대상). 네트워크 호출은 callGemini 가 한다.
 */
export function interpretCandidate(data: unknown): GeminiResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(d.candidates) ? d.candidates : [];
  const first = (candidates[0] ?? {}) as Record<string, unknown>;
  const finishReason = String(first.finishReason ?? "");
  const content = (first.content ?? {}) as Record<string, unknown>;
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = String((parts[0] as Record<string, unknown> | undefined)?.text ?? "");

  if (finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      status: 502,
      message:
        "생성 결과가 길이 제한에 걸려 중간에 끊겼습니다. 문항 개수를 줄이거나 지문을 짧게 요청해 주세요.",
    };
  }
  if (finishReason === "SAFETY" || finishReason === "RECITATION" || finishReason === "PROHIBITED_CONTENT") {
    return { ok: false, status: 502, message: `모델이 생성을 거부했습니다(${finishReason}). 주제를 바꿔 다시 시도해 주세요.` };
  }
  if (!text.trim()) {
    const reason = finishReason ? `(finishReason: ${finishReason})` : "";
    return { ok: false, status: 502, message: `모델이 빈 응답을 보냈습니다 ${reason}`.trim() };
  }
  return { ok: true, text };
}

const RETRYABLE_STATUS = new Set([503, 429]);
const RETRY_DELAYS_MS = [2000, 4000]; // 1차 실패 후 2초, 2차 실패 후 4초 대기 (총 3번 시도)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGemini(
  parts: GeminiPart[],
  options: { temperature?: number; json?: boolean; maxOutputTokens?: number } = {}
): Promise<GeminiResult> {
  // 읽는 시점을 호출 시점으로 미룬다 — 모듈 로드 시점에 한 번만 읽으면, 이 모듈을 가져오는
  // 쪽(예: CLI 스크립트)이 .env.local을 나중에 로드할 때 항상 빈 값을 캡처해버린다.
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (!apiKey) return { ok: false, status: 500, message: "아직 설정되지 않았습니다. (GEMINI_API_KEY 없음)" };

  let lastMessage = "";
  let lastStatus = 502;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            // 지정하지 않으면 모델 기본값을 쓴다 — 기존 호출부의 동작을 바꾸지 않기 위해
            // 옵션으로만 열어둔다(길이 제한에 걸리는 호출부에서만 올려 쓴다).
            ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
            ...(options.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      }
    );

    if (res.ok) {
      // 200 이라도 잘렸거나 거부됐을 수 있다 — interpretCandidate 가 걸러낸다.
      return interpretCandidate(await res.json());
    }

    lastMessage = await res.text();
    lastStatus = res.status;

    const canRetry = RETRYABLE_STATUS.has(res.status) && attempt < RETRY_DELAYS_MS.length;
    if (!canRetry) break;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  return { ok: false, status: lastStatus, message: lastMessage.slice(0, 200) };
}
