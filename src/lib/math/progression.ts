// 수학 학습 진행 구조 PG1: 진행 판정 순수 함수 (RUN_MATH_PROGRESSION.md PG1 1-1). DB 접근 없음.

export type UnitStatus = "locked" | "available" | "in_progress" | "mastered";

export interface JudgeMasteryInput {
  /** 최근 시도(첫 시도만), 최신순 */
  recentFirstTryResults: boolean[];
  sessionCount: number;
  /** 난이도 3 이상 정답 수 */
  hardItemsCorrect: number;
  /** 기본 0.85 */
  targetAccuracy: number;
  /** 기본 8 */
  minItems: number;
}

export interface JudgeMasteryResult {
  mastered: boolean;
  accuracy: number;
  reason: string;
}

// 숙달 판정 — 세 조건 모두 충족해야 mastered:
// 정답률 >= targetAccuracy(기본 0.85) AND 세션 2회 이상 AND 난이도 3+ 정답 3개 이상.
// 데이터가 minItems(기본 8)보다 적으면 정확도 자체를 신뢰할 수 없으니 그 전에 걸러낸다.
export function judgeMastery(input: JudgeMasteryInput): JudgeMasteryResult {
  const { recentFirstTryResults, sessionCount, hardItemsCorrect, targetAccuracy, minItems } = input;
  const items = recentFirstTryResults.length;
  const correct = recentFirstTryResults.filter(Boolean).length;
  const accuracy = items > 0 ? correct / items : 0;

  if (items < minItems) {
    return { mastered: false, accuracy, reason: "insufficient_items" };
  }
  if (accuracy < targetAccuracy) {
    return { mastered: false, accuracy, reason: "accuracy_below_target" };
  }
  if (sessionCount < 2) {
    return { mastered: false, accuracy, reason: "insufficient_sessions" };
  }
  if (hardItemsCorrect < 3) {
    return { mastered: false, accuracy, reason: "insufficient_hard_items" };
  }
  return { mastered: true, accuracy, reason: "mastered" };
}

export type NextStepAction = "master" | "retry_same" | "retry_easier" | "fallback_prereq" | "flag_stuck";

export interface DecideNextStepInput {
  accuracy: number;
  consecutiveFailedSessions: number;
}

export interface DecideNextStepResult {
  action: NextStepAction;
  difficultyDelta: number;
}

// 세션 결과 → 다음 조치. 이 함수는 정답률/연속실패만 보고 "숙달이 아직 아닌 경우" 다음에 뭘 할지
// 고르는 역할이다 — 숙달 여부 자체(세션 횟수·고난도 정답 수까지 반영)는 judgeMastery가 결정한다.
// completeSession(1-2)은 항상 judgeMastery를 먼저 부르고, mastered=false일 때만 이 함수를 호출한다.
// 그래서 여기서의 "정답률 >= 0.85"는 (judgeMastery가 이미 아니라고 판정했으므로) "잘하고 있지만
// 세션 수·고난도 정답이 더 필요하다"는 뜻이 되어 retry_same(같은 난이도로 계속)이 된다.
//
// 3세션 연속 미달(flag_stuck)은 정답률과 무관하게 최우선으로 확인한다 — 방치하면 학생이 조용히
// 이탈하므로 절대 빠뜨리면 안 된다(지시서 명시).
export function decideNextStep(input: DecideNextStepInput): DecideNextStepResult {
  const { accuracy, consecutiveFailedSessions } = input;

  if (consecutiveFailedSessions >= 3) {
    return { action: "flag_stuck", difficultyDelta: 0 };
  }
  if (accuracy >= 0.85) {
    return { action: "retry_same", difficultyDelta: 0 };
  }
  if (accuracy >= 0.5) {
    return { action: "retry_easier", difficultyDelta: -1 };
  }
  return { action: "fallback_prereq", difficultyDelta: 0 };
}
