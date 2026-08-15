import type { ToeflSection } from "./types";

// spec §2: 2026 포맷은 영역 순서가 고정이다(R → L → S → W). 풀 모의고사(mode='full')가
// 이 순서대로 섹션을 이어 붙일 때 기준으로 쓴다.
export const SECTION_ORDER: ToeflSection[] = ["reading", "listening", "speaking", "writing"];

export function nextSection(current: ToeflSection): ToeflSection | null {
  const idx = SECTION_ORDER.indexOf(current);
  if (idx === -1 || idx === SECTION_ORDER.length - 1) return null;
  return SECTION_ORDER[idx + 1];
}
