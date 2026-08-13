// 영어 완전학습 화면(Stage 3)에서 쓰는 DB 행 형태 타입.
// 엔진(src/lib/engine)의 순수 타입과는 별개다 — 여기는 Supabase 테이블 모양을 그대로 반영한다.

export type WordSense = {
  id: string;
  meaningKo: string;
  meaningEn: string | null;
};

export type WordExample = {
  id: string;
  textEn: string;
  textKo: string | null;
};

export type WordContent = {
  id: string;
  lemma: string;
  pos: string | null;
  senses: WordSense[];
  examples: WordExample[];
};

export type WordProgress = {
  level: number; // 0~5
  stability: number | null;
  difficulty: number | null;
  consecutiveWrong: number;
  consecutiveCorrect: number;
  lastSessionId: string | null;
  lastItemType: string | null;
};

// 세션 큐 항목 하나. content=단어 내용, progress=이 학생의 기존 진도(없으면 새 단어).
export type QueueItem = {
  content: WordContent;
  progress: WordProgress | null;
  confusionPartner: { wordId: string; lemma: string } | null;
};

export type UnitGateStatus = "locked" | "in_progress" | "passed";

export type UnitSummary = {
  id: string;
  setId: string;
  setTitleKo: string;
  title: string;
  position: number;
  wordCount: number;
  newCount: number;
  dueCount: number;
  status: UnitGateStatus; // 90% 게이트 통과 여부 (locked = 이전 유닛 통과 전)
  cycleCount: number; // 교정학습 반복 횟수
  masteryRatio: number; // 유닛 단어 중 Lv3 이상 비율 — 종합평가 버튼 노출 여부 판단용
};

export type UnitProgress = {
  masteryRatio: number;
  testScore: number | null;
  status: UnitGateStatus;
  cycleCount: number;
};

export type SessionMode = "learn" | "review" | "corrective" | "test";
