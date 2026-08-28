import type { ToeflSection, ToeflTaskType } from "./types";

// 12개 문항 유형의 표시 이름 + 소속 영역. 랜딩(/toefl §types)의 TYPE_GROUPS와
// /toefl/practice/[type] 페이지 제목이 같은 이름을 쓰도록 한 곳에 모았다(2026-08-28,
// 예전엔 랜딩 파일 안에 문자열로만 있었음 — 연습 라우트가 생기며 두 번째 소비처가 생겨 추출).

export const TASK_TYPE_LABELS: Record<ToeflTaskType, { ko: string; en: string; section: ToeflSection }> = {
  complete_the_words: { ko: "단어 완성하기", en: "Complete the Words", section: "reading" },
  daily_life: { ko: "실생활 지문 읽기", en: "Read in Daily Life", section: "reading" },
  academic_passage: { ko: "학술 지문 읽기", en: "Read an Academic Passage", section: "reading" },
  choose_a_response: { ko: "응답 고르기", en: "Listen & Choose a Response", section: "listening" },
  conversation: { ko: "일상 대화 듣기", en: "Daily-life Conversation", section: "listening" },
  announcement: { ko: "공지 듣기", en: "Announcement", section: "listening" },
  academic_talk: { ko: "학술 강의 듣기", en: "Academic Talk", section: "listening" },
  listen_and_repeat: { ko: "듣고 따라 말하기", en: "Listen & Repeat", section: "speaking" },
  take_an_interview: { ko: "인터뷰 응답", en: "Take an Interview", section: "speaking" },
  build_a_sentence: { ko: "문장 완성하기", en: "Build a Sentence", section: "writing" },
  write_an_email: { ko: "이메일 작성", en: "Write an E-mail", section: "writing" },
  academic_discussion: { ko: "토론 글쓰기", en: "Academic Discussion", section: "writing" },
};

export const TASK_TYPE_LIST = Object.keys(TASK_TYPE_LABELS) as ToeflTaskType[];

export function isToeflTaskType(value: string): value is ToeflTaskType {
  return value in TASK_TYPE_LABELS;
}
