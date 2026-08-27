// Gemini TTS 호출. src/lib/gemini-server.ts(텍스트 생성용)와 별개 — 응답 형태가 완전히 달라서
// (텍스트가 아니라 오디오 inlineData) 재사용하지 않고 이 파일에 따로 둔다.
// 서버(관리자 라우트)에서만 호출한다 — 클라이언트에서 API 키 직접 사용 금지(CLAUDE.md 공통 규칙).
//
// 실사용 중 발견: TTS 프리뷰 모델의 무료 등급 한도가 분당 3건으로 낮아서(2026-08-15 실제로 429
// 받음 — "Quota exceeded ... limit: 3 ... Please retry in 37s"), 문항 여러 개를 연달아 생성하면
// 뒤쪽이 거의 확실히 걸린다. Gemini가 응답 메시지에 남겨주는 "retry in Ns" 시간을 그대로 읽어서
// 그만큼 기다렸다가 재시도한다.

import { parsePcmSampleRate, pcmDurationSec, pcmToWav } from "./wav";

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 20000;

export type TtsResult =
  | { ok: true; wav: Buffer; sampleRate: number; durationSec: number }
  | { ok: false; status: number; message: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini 429 응답 본문의 "Please retry in 37.88...s" 문구에서 대기 시간을 뽑는다.
function parseRetryDelayMs(body: string): number {
  const match = /retry in (\d+(?:\.\d+)?)s/i.exec(body);
  if (!match) return DEFAULT_RETRY_DELAY_MS;
  return Math.ceil(Number(match[1]) * 1000) + 1000; // 여유 1초
}

// text: 실제로 소리내어 읽을 문장(자연스러운 낭독 톤을 원하면 앞에 스타일 지시를 붙여도 됨).
// 호출 시점에 읽는다(모듈 로드 시점에 상수로 캡처하면 안 된다) — CLI 스크립트는
// .env.local을 import보다 늦게 로드하는 구조라 상수로 캡처하면 항상 빈 값이 된다
// (scripts/toefl-generate.ts 쪽 GEMINI_API_KEY에서 실제로 겪은 버그, gemini-server.ts와 동일 수정).
export async function generateSpeechWav(text: string, voiceName = "Kore"): Promise<TtsResult> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
  if (!GEMINI_API_KEY) return { ok: false, status: 500, message: "GEMINI_API_KEY가 설정되지 않았습니다." };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
            },
          }),
        }
      );
    } catch (e) {
      return { ok: false, status: 502, message: `Gemini TTS 요청 실패: ${(e as Error).message}` };
    }

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const body = await res.text().catch(() => "");
      await sleep(parseRetryDelayMs(body));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, message: `Gemini TTS 오류(${res.status}): ${body.slice(0, 500)}` };
    }

    const json = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    } | null;

    const inline = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!inline?.data) {
      return { ok: false, status: 502, message: `Gemini TTS 응답에서 오디오를 찾지 못했습니다: ${JSON.stringify(json).slice(0, 500)}` };
    }

    const pcm = Buffer.from(inline.data, "base64");
    const sampleRate = parsePcmSampleRate(inline.mimeType ?? "", 24000);
    const wav = pcmToWav(pcm, { sampleRate, numChannels: 1, bitsPerSample: 16 });
    const durationSec = pcmDurationSec(pcm, { sampleRate, numChannels: 1, bitsPerSample: 16 });

    return { ok: true, wav, sampleRate, durationSec };
  }

  return { ok: false, status: 429, message: "Gemini TTS 할당량 초과가 재시도 후에도 계속됩니다." };
}
