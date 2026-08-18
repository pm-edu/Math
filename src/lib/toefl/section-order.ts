import type { DictKey } from "@/lib/i18n";
import type { ToeflSection, ToeflTaskType } from "./types";

// spec §2: 2026 포맷은 영역 순서가 고정이다(R → L → S → W). 풀 모의고사(mode='full')가
// 이 순서대로 섹션을 이어 붙일 때 기준으로 쓴다.
export const SECTION_ORDER: ToeflSection[] = ["reading", "listening", "speaking", "writing"];

// spec §8: Reading/Listening만 Stage1→Stage2 적응형 라우팅이 있다. finish 라우트와 insights
// 라우트 둘 다 이 목록으로 분기하므로 한 곳에 둔다(전엔 finish route에만 로컬 상수로 있었음).
export const ADAPTIVE_SECTIONS: ToeflSection[] = ["reading", "listening"];

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

// task_type → section은 DB에 join 없이도 고정된 관계다(spec §5 enum이 애초에 section별로
// 묶여 있음, 겹치는 유형 없음) — submitted/page.tsx가 toefl_item_public(section 컬럼 없음)에서
// 곧장 "이 문항이 어느 섹션 채점 상태인지"를 판정할 때 module_id→toefl_module(직원 전용 RLS)
// 조인 없이 이걸로 충분하다.
export const TASK_TYPE_SECTION: Record<ToeflTaskType, ToeflSection> = {
  complete_the_words: "reading",
  daily_life: "reading",
  academic_passage: "reading",
  choose_a_response: "listening",
  conversation: "listening",
  announcement: "listening",
  academic_talk: "listening",
  listen_and_repeat: "speaking",
  take_an_interview: "speaking",
  build_a_sentence: "writing",
  write_an_email: "writing",
  academic_discussion: "writing",
};

// SECTION_LABEL/SECTION_DESCRIPTION 자체는 절대 안 건드린다 — SectionDoneActions.tsx가 실제
// 시험 흐름(test/[attemptId]/... 안의 "다음 영역으로" 버튼) 안에서 이 상수를 그대로 쓰고,
// 거기는 spec §14 "학생 응시 화면은 영어만"이 여전히 유효해서 언어 토글과 무관하게 항상
// 영어여야 한다. 아래 두 매핑은 ToeflHeader가 있는 "안내" 화면(진입/마이페이지/제출후/리포트/
// 리뷰)에서만 쓴다 — t(SECTION_LABEL_KEY[section]) 형태로.
export const SECTION_LABEL_KEY: Record<ToeflSection, DictKey> = {
  reading: "toefl_sectionReading",
  listening: "toefl_sectionListening",
  speaking: "toefl_sectionSpeaking",
  writing: "toefl_sectionWriting",
};

export const SECTION_DESCRIPTION_KEY: Record<ToeflSection, DictKey> = {
  reading: "toefl_sectionDescReading",
  listening: "toefl_sectionDescListening",
  speaking: "toefl_sectionDescSpeaking",
  writing: "toefl_sectionDescWriting",
};

export function nextSection(current: ToeflSection): ToeflSection | null {
  const idx = SECTION_ORDER.indexOf(current);
  if (idx === -1 || idx === SECTION_ORDER.length - 1) return null;
  return SECTION_ORDER[idx + 1];
}
