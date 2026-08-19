// 12개 문항 유형의 메타데이터 한 곳. 클라이언트에서 그대로 import 해도 안전하다
// (프롬프트·정답 로직은 여기 없다 — 그건 server/generators/ 가 든다).
//
// 왜 분리했나: 관리 화면(클라이언트)이 유형 목록을 자기 파일에 따로 복제해 두고 있었다.
// 유형을 하나 추가할 때 두 곳을 고쳐야 하고, 어긋나면 화면엔 보이는데 생성이 안 되는 식으로
// 조용히 깨진다. 목록은 여기서만 정하고, 생성기는 여기 값을 가져다 쓴다
// (server/generators/registry.test.ts 가 둘이 어긋나지 않는지 검사한다).

import type { ToeflSection, ToeflTaskType } from "@/lib/toefl/types";

export type TaskCatalogEntry = {
  taskType: ToeflTaskType;
  section: ToeflSection;
  /** 관리 화면 표시용. 영문 공식 명칭 + 괄호 안 한국어 설명. */
  label: string;
  /** 지문·스크립트 하나를 만들고 문항들이 공유하는가 */
  needsStimulus: boolean;
  /** AI 생성기가 붙어 있는가. false면 관리 화면 유형 목록에서 "준비 중"으로 표시. */
  generatable: boolean;
};

export const TASK_CATALOG: TaskCatalogEntry[] = [
  // ───── Reading ─────
  { taskType: "complete_the_words", section: "reading", label: "Complete the Words (빈칸 채우기)", needsStimulus: false, generatable: true },
  { taskType: "daily_life", section: "reading", label: "Daily Life (생활문 독해)", needsStimulus: true, generatable: true },
  { taskType: "academic_passage", section: "reading", label: "Academic Passage (학술 지문 독해)", needsStimulus: true, generatable: true },

  // ───── Listening ─────
  { taskType: "choose_a_response", section: "listening", label: "Choose a Response (짧은 응답 고르기)", needsStimulus: false, generatable: true },
  { taskType: "conversation", section: "listening", label: "Conversation (대화)", needsStimulus: true, generatable: true },
  { taskType: "announcement", section: "listening", label: "Announcement (공지)", needsStimulus: true, generatable: true },
  { taskType: "academic_talk", section: "listening", label: "Academic Talk (강의)", needsStimulus: true, generatable: true },

  // ───── Speaking (생성기 미구현) ─────
  // 둘 다 학생 음성을 받는다. listen_and_repeat 는 목표 문장과 대조(auto_transcript),
  // take_an_interview 는 루브릭 채점(ai_rubric)이라 answer_key 가 없다.
  { taskType: "listen_and_repeat", section: "speaking", label: "Listen & Repeat (듣고 따라 말하기)", needsStimulus: false, generatable: false },
  { taskType: "take_an_interview", section: "speaking", label: "Take an Interview (인터뷰 응답)", needsStimulus: false, generatable: false },

  // ───── Writing (생성기 미구현) ─────
  // build_a_sentence 는 단어 조각 순서(auto_sequence), 나머지 둘은 루브릭 채점.
  { taskType: "build_a_sentence", section: "writing", label: "Build a Sentence (문장 완성)", needsStimulus: false, generatable: false },
  { taskType: "write_an_email", section: "writing", label: "Write an E-mail (이메일 작성)", needsStimulus: false, generatable: false },
  { taskType: "academic_discussion", section: "writing", label: "Academic Discussion (토론 글쓰기)", needsStimulus: true, generatable: false },
];

const BY_TYPE = new Map(TASK_CATALOG.map((e) => [e.taskType, e]));

export function catalogEntry(taskType: string): TaskCatalogEntry | null {
  return BY_TYPE.get(taskType as ToeflTaskType) ?? null;
}

/** 생성기가 붙어 있는 유형만 — 관리 화면의 "AI로 생성" 목록. */
export const GENERATABLE_TASKS: TaskCatalogEntry[] = TASK_CATALOG.filter((e) => e.generatable);

export function tasksForSection(section: ToeflSection): TaskCatalogEntry[] {
  return TASK_CATALOG.filter((e) => e.section === section);
}

/** 영역 순서 — 화면의 영역 세그먼트가 이 순서를 따른다. */
export const SECTION_SEQUENCE: ToeflSection[] = ["reading", "listening", "speaking", "writing"];
