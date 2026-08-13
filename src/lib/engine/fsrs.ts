// FSRS(간격반복 스케줄러)에서 영감을 받은 단순화 구현 — "언제 복습할지"만 담당한다.
// 5단계 사다리(mastery-level.ts)는 "그 순간 어떤 문항 유형을 낼지"를 담당한다.
// 두 축은 직교(orthogonal)하다: FSRS는 due_at만 계산하고, 사다리 레벨과는 서로
// 참조하지 않는다. 문항 생성기(items/)가 "레벨에 맞는 문항 유형을 고르는" 역할로
// 두 축을 연결한다.
//
// 설계 메모(정직하게 밝힘): 이건 공식 FSRS-5(약 19개 파라미터의 최적화 모델)가
// 아니라, 같은 핵심 아이디어(반복=오래 걸림, 오답=붕괴)를 담은 단순화된 근사치다.
// 실사용 데이터가 쌓이면 공식 FSRS 라이브러리로 교체를 검토한다.

import type { FsrsRating } from "./types";

export type FsrsState = {
  stability: number; // 이 값(일 단위)이 클수록 오래 기억한다고 본다
  difficulty: number; // 1(쉬움)~10(어려움). 클수록 반복해도 stability가 덜 늘어난다
  dueAt: string; // ISO. 다음 복습 시각
};

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const DEFAULT_DIFFICULTY = 5;
const MIN_STABILITY_DAYS = 0.25; // 최소 6시간 — 0으로 떨어져 "즉시 다시" 무한반복되는 것을 막는다
const MAX_STABILITY_DAYS = 365 * 5; // 최대 5년 — easy를 계속 줘도 간격이 무한히 커지지 않게(+Date 오버플로 방지)

// 첫 복습(이전 상태가 없을 때)의 초기 간격(일)
const INITIAL_STABILITY_DAYS: Record<FsrsRating, number> = {
  again: 0.25, // 오늘 안에 다시
  hard: 1,
  good: 3,
  easy: 5,
};

function clampDifficulty(d: number): number {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, d));
}

export function scheduleNext(prev: FsrsState | null, rating: FsrsRating, now: Date): FsrsState {
  if (!prev) {
    const stability = INITIAL_STABILITY_DAYS[rating];
    return {
      stability,
      difficulty: DEFAULT_DIFFICULTY,
      dueAt: addDays(now, stability).toISOString(),
    };
  }

  let stability: number;
  let difficulty = prev.difficulty;

  switch (rating) {
    case "again":
      stability = Math.max(MIN_STABILITY_DAYS, prev.stability * 0.2);
      difficulty = clampDifficulty(difficulty + 0.2 * (MAX_DIFFICULTY - MIN_DIFFICULTY));
      break;
    case "hard":
      stability = prev.stability * 1.2;
      difficulty = clampDifficulty(difficulty + 0.05 * (MAX_DIFFICULTY - MIN_DIFFICULTY));
      break;
    case "good":
      stability = prev.stability * (2.0 + (MAX_DIFFICULTY - difficulty) * 0.1);
      difficulty = clampDifficulty(difficulty - 0.02 * (MAX_DIFFICULTY - MIN_DIFFICULTY));
      break;
    case "easy":
      stability = prev.stability * (2.8 + (MAX_DIFFICULTY - difficulty) * 0.15);
      difficulty = clampDifficulty(difficulty - 0.05 * (MAX_DIFFICULTY - MIN_DIFFICULTY));
      break;
  }

  stability = Math.min(MAX_STABILITY_DAYS, Math.max(MIN_STABILITY_DAYS, stability));

  return { stability, difficulty, dueAt: addDays(now, stability).toISOString() };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000);
}
