// Gemini 임베딩 호출. tts.ts와 마찬가지로 Gemini API를 쓰지만 응답 형태가 완전히 달라서
// 별도 파일로 둔다. toefl_item.embedding(vector(1024))과 차원을 맞추려고
// outputDimensionality: 1024로 명시한다([[toefl-item-pipeline-project]] Phase 3).
//
// 서버(관리 스크립트)에서만 호출한다 — 클라이언트에서 API 키 직접 사용 금지(CLAUDE.md 공통 규칙).

const EMBEDDING_MODEL = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 1024;
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 20000;

export type EmbeddingResult = { ok: true; values: number[] } | { ok: false; status: number; message: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(body: string): number {
  const match = /retry in (\d+(?:\.\d+)?)s/i.exec(body);
  if (!match) return DEFAULT_RETRY_DELAY_MS;
  return Math.ceil(Number(match[1]) * 1000) + 1000;
}

// text: 중복검사 대상 텍스트(호출 시점에 GEMINI_API_KEY를 읽는다 — tts.ts와 같은 이유,
// CLI 스크립트는 .env.local을 import보다 늦게 로드한다).
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
  if (!GEMINI_API_KEY) return { ok: false, status: 500, message: "GEMINI_API_KEY가 설정되지 않았습니다." };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType: "SEMANTIC_SIMILARITY",
            outputDimensionality: OUTPUT_DIMENSIONALITY,
          }),
        }
      );
    } catch (e) {
      return { ok: false, status: 502, message: `Gemini 임베딩 요청 실패: ${(e as Error).message}` };
    }

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const body = await res.text().catch(() => "");
      await sleep(parseRetryDelayMs(body));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: `Gemini 임베딩 오류(${res.status}): ${body.slice(0, 500)}` };
    }

    const json = (await res.json().catch(() => null)) as { embedding?: { values?: number[] } } | null;
    const values = json?.embedding?.values;
    if (!Array.isArray(values) || values.length !== OUTPUT_DIMENSIONALITY) {
      return { ok: false, status: 502, message: `Gemini 임베딩 응답이 예상과 다릅니다: ${JSON.stringify(json).slice(0, 300)}` };
    }
    return { ok: true, values };
  }

  return { ok: false, status: 429, message: "Gemini 임베딩 할당량 초과가 재시도 후에도 계속됩니다." };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
