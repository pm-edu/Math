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

// 진입화면 "영역별 연습" 카드용 한 줄 설명(2026-08-18) — 이름만으론 각 영역이 실제로 뭘
// 연습시키는지 안 보인다는 지적으로 추가. §6의 task_type 12종을 학생이 이해할 수 있는 말로
// 압축한 것이라 실제 문항 구성과 일치한다(예: reading=complete_the_words+daily_life+academic_passage).
export const SECTION_DESCRIPTION: Record<ToeflSection, string> = {
  reading: "Fill-in-the-blank vocabulary and short passages",
  listening: "Conversations, announcements, and lectures",
  speaking: "Repeat sentences and answer interview questions",
  writing: "Build sentences and write structured responses",
};

export function nextSection(current: ToeflSection): ToeflSection | null {
  const idx = SECTION_ORDER.indexOf(current);
  if (idx === -1 || idx === SECTION_ORDER.length - 1) return null;
  return SECTION_ORDER[idx + 1];
}
