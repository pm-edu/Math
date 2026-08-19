// 문항 생성에 쓰는 LLM 제공자 전환.
//
// 왜 필요한가: 대량 생성(폼 하나에 143문항, 10폼이면 1,430문항)을 클라우드 API로만 돌리면
// 쿼터·비용·서버리스 60초 제한에 계속 걸린다. 로컬 모델(Ollama)은 느려도 무제한이라
// 밤새 돌려두기에 맞다. 프롬프트와 파싱은 그대로 쓰고 "누가 답을 만드는가"만 바꾼다.
//
// 품질은 같지 않다 — 로컬 Q4 8B 모델은 문법은 맞아도 시험지에 실릴 만한 자연스러운 영어는
// 덜 나온다. TOEFL은 영어 자체를 재는 시험이라 이 차이가 중요하다. 그래서 유형별로 골라
// 쓰는 것을 전제로 한다(짧고 정형적인 유형은 로컬, 긴 지문은 클라우드).
//
// 어느 쪽이든 결과물은 관리자 검수를 거쳐야 학생에게 노출된다(toefl_item.verified).

import { callGemini, type GeminiResult } from "@/lib/gemini-server";

export type LlmProvider = "gemini" | "ollama";
export type LlmResult = GeminiResult;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.replace(/\/$/, "") || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3-vl:latest";

/** 배포된 서버(Vercel)는 사용자의 localhost에 닿을 수 없다 — 로컬 실행에서만 쓸 수 있다. */
export function isLocalProvider(provider: LlmProvider): boolean {
  return provider === "ollama";
}

/**
 * 추론형 모델이 앞에 붙이는 <think>…</think> 를 걷어낸다.
 * DeepSeek-R1 계열은 JSON 앞에 사고 과정을 먼저 쓰기 때문에 그대로 파싱하면 깨진다.
 * 그 뒤 남은 문자열에서 가장 바깥 JSON 덩어리만 잘라낸다(모델이 설명을 덧붙이는 경우 대비).
 */
export function extractJsonText(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = withoutThinking.search(/[[{]/);
  if (start < 0) return withoutThinking;
  const openChar = withoutThinking[start];
  const closeChar = openChar === "{" ? "}" : "]";
  const end = withoutThinking.lastIndexOf(closeChar);
  if (end <= start) return withoutThinking.slice(start);
  return withoutThinking.slice(start, end + 1);
}

async function callOllama(
  prompt: string,
  options: { temperature?: number; json?: boolean }
): Promise<LlmResult> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        ...(options.json ? { format: "json" } : {}),
        options: { temperature: options.temperature ?? 0.7 },
      }),
    });
  } catch (e) {
    return {
      ok: false,
      status: 503,
      message: `로컬 모델에 연결하지 못했습니다(${OLLAMA_BASE_URL}). Ollama가 실행 중인지 확인해 주세요. ${(e as Error).message}`,
    };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, message: (await res.text()).slice(0, 200) };
  }

  const data = (await res.json()) as { response?: string; done_reason?: string };
  const text = extractJsonText(String(data.response ?? ""));
  if (!text.trim()) {
    return { ok: false, status: 502, message: `로컬 모델이 빈 응답을 보냈습니다(${data.done_reason ?? "이유 없음"}).` };
  }
  // 길이 제한으로 끊긴 경우 — 클라우드의 MAX_TOKENS 와 같은 상황이라 같은 안내를 준다.
  if (data.done_reason === "length") {
    return {
      ok: false,
      status: 502,
      message: "생성 결과가 길이 제한에 걸려 중간에 끊겼습니다. 문항 개수를 줄이거나 지문을 짧게 요청해 주세요.",
    };
  }
  return { ok: true, text };
}

/** 제공자를 골라 한 번 호출한다. 프롬프트·응답 해석은 호출부(생성기)가 그대로 담당한다. */
export async function callLlm(
  prompt: string,
  options: { provider?: LlmProvider; temperature?: number; json?: boolean } = {}
): Promise<LlmResult> {
  const provider = options.provider ?? "gemini";
  if (provider === "ollama") {
    return callOllama(prompt, options);
  }
  return callGemini([{ text: prompt }], { temperature: options.temperature, json: options.json });
}

export function describeProvider(provider: LlmProvider): string {
  return provider === "ollama" ? `로컬 ${OLLAMA_MODEL}` : "Gemini";
}
