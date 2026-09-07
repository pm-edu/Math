// 수학 학습 진행 구조 PG5: 복습 스케줄러 (RUN_MATH_PROGRESSION.md PG5 5-1). 순수 함수.
//
// 지시서: "단어학습 v2의 FSRS 구현이 있으면 그 로직을 재사용하고 어디서 가져왔는지 보고."
// 있었다 — src/lib/engine/fsrs.ts(간격 계산) + src/lib/engine/rating.ts(정답/반응시간으로
// 등급 산출). 여기서는 그 두 함수를 그대로 불러다 쓰고, math_unit_states 스키마(등급이
// 1~4 숫자, reps/lapses 카운터 컬럼)에 맞는 얇은 래퍼만 씌운다 — 알고리즘 자체는
// 새로 만들지 않는다.

import { scheduleNext as engineScheduleNext, type FsrsState } from "@/lib/engine/fsrs";
import { deriveRating } from "@/lib/engine/rating";
import type { FsrsRating } from "@/lib/engine/types";

const GRADE_TO_RATING: Record<1 | 2 | 3 | 4, FsrsRating> = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
const RATING_TO_GRADE: Record<FsrsRating, 1 | 2 | 3 | 4> = { again: 1, hard: 2, good: 3, easy: 4 };

export interface MathFsrsState {
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
}

export interface MathFsrsResult {
  stability: number;
  difficulty: number;
  intervalDays: number;
}

// reps/lapses는 지시서 시그니처 그대로 받지만 스케줄 계산 자체엔 안 쓴다 — 재사용하는
// engine/fsrs.ts의 단순화 모델이 이전 stability/difficulty만으로 다음 간격을 정하기
// 때문이다(카운터 증감은 호출부인 session.ts가 담당).
export function scheduleNext(state: MathFsrsState, grade: 1 | 2 | 3 | 4): MathFsrsResult {
  const rating = GRADE_TO_RATING[grade];
  const prev: FsrsState | null =
    state.stability !== null && state.difficulty !== null
      ? { stability: state.stability, difficulty: state.difficulty, dueAt: new Date(0).toISOString() }
      : null;
  const next = engineScheduleNext(prev, rating, new Date());
  // engine의 stability는 "일" 단위 간격 그 자체로 쓰인다(engine/fsrs.ts 자체 설명 참고) —
  // 그래서 intervalDays는 stability와 같은 값이다.
  return { stability: next.stability, difficulty: next.difficulty, intervalDays: next.stability };
}

// 문항 하나의 정답 여부(+선택적 반응시간)를 1~4 등급으로 변환한다 — 등급을 학생이 직접
// 매기지 않는다는 원칙도 engine/rating.ts와 동일하게 따른다.
export function deriveGrade(isCorrect: boolean, elapsedSeconds?: number): 1 | 2 | 3 | 4 {
  const rating = deriveRating({ isCorrect, responseMs: elapsedSeconds !== undefined ? elapsedSeconds * 1000 : undefined });
  return RATING_TO_GRADE[rating];
}
