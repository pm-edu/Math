// 영어 단어 완전학습 공통 타입 · SRS(간격반복) 로직.
// 시험 종류는 tag 로만 구분해, 나중에 SAT/TOEFL/IELTS 가 같은 엔진을 그대로 쓴다.

export const VOCAB_TAGS = ["general", "SAT", "TOEFL", "IELTS"] as const;
export type VocabTag = (typeof VOCAB_TAGS)[number];

export type Word = {
  id: string;
  deck: string;
  tag: string;
  word: string;
  meaning: string;
  part_of_speech: string | null;
  example: string | null;
  example_ko: string | null;
  level: number;
  source: string;
  verified: boolean;
  created_at: string;
};

export type WordProgress = {
  id: string;
  user_id: string;
  word_id: string;
  box: number;
  correct_streak: number;
  wrong_count: number;
  next_review_at: string;
  last_reviewed_at: string | null;
};

// Leitner 상자(1~5)별 다음 복습까지 간격(일). box1 은 같은 날 다시(0일).
const BOX_DAYS = [0, 1, 3, 7, 16];

export const MAX_BOX = 5;

// 채점 결과로 다음 상자를 계산: 맞으면 한 칸 위(최대 5), 틀리면 1로.
export function nextBox(box: number, correct: boolean): number {
  if (!correct) return 1;
  return Math.min(box + 1, MAX_BOX);
}

// 상자에 맞는 다음 복습 시각(ISO)을 계산한다.
export function nextReviewAt(box: number): string {
  const days = BOX_DAYS[Math.min(Math.max(box, 1), MAX_BOX) - 1];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// box 5 이고 연속으로 여러 번 맞힌 단어를 "완료(마스터)"로 본다.
export function isMastered(p: { box: number }): boolean {
  return p.box >= MAX_BOX;
}
