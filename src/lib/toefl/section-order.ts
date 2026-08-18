import type { ToeflSection } from "./types";

// spec §2: 2026 포맷은 영역 순서가 고정이다(R → L → S → W). 풀 모의고사(mode='full')가
// 이 순서대로 섹션을 이어 붙일 때 기준으로 쓴다.
export const SECTION_ORDER: ToeflSection[] = ["reading", "listening", "speaking", "writing"];

// 화면 3곳(SectionDoneActions/report/entry)에 각자 따로 정의돼 있던 걸 공용으로 뽑음.
export const SECTION_LABEL: Record<ToeflSection, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
};

export function nextSection(current: ToeflSection): ToeflSection | null {
  const idx = SECTION_ORDER.indexOf(current);
  if (idx === -1 || idx === SECTION_ORDER.length - 1) return null;
  return SECTION_ORDER[idx + 1];
}
