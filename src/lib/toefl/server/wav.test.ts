import { describe, expect, it } from "vitest";
import { parsePcmSampleRate, pcmDurationSec, pcmToWav } from "./wav";

describe("pcmToWav", () => {
  it("44바이트 RIFF/WAVE 헤더를 앞에 붙인다", () => {
    const pcm = Buffer.alloc(1000);
    const wav = pcmToWav(pcm, { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 });
    expect(wav.length).toBe(44 + 1000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt32LE(40)).toBe(1000); // data 청크 크기
    expect(wav.readUInt32LE(24)).toBe(24000); // sampleRate
    expect(wav.readUInt16LE(22)).toBe(1); // channels
    expect(wav.readUInt16LE(34)).toBe(16); // bitsPerSample
  });

  it("byteRate/blockAlign을 올바르게 계산한다", () => {
    const wav = pcmToWav(Buffer.alloc(10), { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 });
    expect(wav.readUInt32LE(28)).toBe(24000 * 1 * 2); // byteRate
    expect(wav.readUInt16LE(32)).toBe(2); // blockAlign
  });
});

describe("parsePcmSampleRate", () => {
  it("mimeType에서 rate를 추출한다", () => {
    expect(parsePcmSampleRate("audio/L16;codec=pcm;rate=24000")).toBe(24000);
  });

  it("rate가 없으면 기본값", () => {
    expect(parsePcmSampleRate("audio/wav", 16000)).toBe(16000);
  });
});

describe("pcmDurationSec", () => {
  it("24000Hz mono 16bit 기준 재생시간 계산", () => {
    // 1초 분량 = 24000 샘플 * 2바이트
    const pcm = Buffer.alloc(24000 * 2);
    expect(pcmDurationSec(pcm, { sampleRate: 24000, numChannels: 1, bitsPerSample: 16 })).toBe(1);
  });
});
