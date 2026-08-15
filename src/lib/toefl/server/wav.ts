// Gemini TTS는 헤더 없는 raw PCM(16bit signed, little-endian, 보통 mono 24kHz)만 돌려준다.
// 브라우저 <audio> 태그가 재생하려면 RIFF/WAVE 헤더가 필요해서, 그 44바이트 헤더를 직접 씌운다.
// 순수 함수 — 네트워크/DB 접근 없음.

export function pcmToWav(
  pcm: Buffer,
  options: { sampleRate?: number; numChannels?: number; bitsPerSample?: number } = {}
): Buffer {
  const sampleRate = options.sampleRate ?? 24000;
  const numChannels = options.numChannels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;

  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt 청크 크기(PCM은 16)
  header.writeUInt16LE(1, 20); // 오디오 포맷 = 1(PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

// Gemini가 돌려주는 mimeType 예: "audio/L16;codec=pcm;rate=24000" — rate만 뽑아 쓴다.
export function parsePcmSampleRate(mimeType: string, fallback = 24000): number {
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? Number(match[1]) : fallback;
}

// 재생 시간(초) 계산 — toefl_stimulus.audio_duration_sec에 저장할 값.
export function pcmDurationSec(
  pcm: Buffer,
  options: { sampleRate?: number; numChannels?: number; bitsPerSample?: number } = {}
): number {
  const sampleRate = options.sampleRate ?? 24000;
  const numChannels = options.numChannels ?? 1;
  const bitsPerSample = options.bitsPerSample ?? 16;
  const bytesPerSample = (numChannels * bitsPerSample) / 8;
  return pcm.length / (sampleRate * bytesPerSample);
}
