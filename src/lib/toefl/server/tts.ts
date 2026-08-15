// Gemini TTS 호출. src/lib/gemini-server.ts(텍스트 생성용)와 별개 — 응답 형태가 완전히 달라서
// (텍스트가 아니라 오디오 inlineData) 재사용하지 않고 이 파일에 따로 둔다.
// 서버(관리자 라우트)에서만 호출한다 — 클라이언트에서 API 키 직접 사용 금지(CLAUDE.md 공통 규칙).

import { parsePcmSampleRate, pcmDurationSec, pcmToWav } from "./wav";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

export type TtsResult =
  | { ok: true; wav: Buffer; sampleRate: number; durationSec: number }
  | { ok: false; status: number; message: string };

// text: 실제로 소리내어 읽을 문장(자연스러운 낭독 톤을 원하면 앞에 스타일 지시를 붙여도 됨).
export async function generateSpeechWav(text: string, voiceName = "Kore"): Promise<TtsResult> {
  if (!GEMINI_API_KEY) return { ok: false, status: 500, message: "GEMINI_API_KEY가 설정되지 않았습니다." };

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
