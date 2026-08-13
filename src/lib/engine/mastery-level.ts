// 숙련도 5단계 사다리(Lv0~5)의 승급/강등 규칙. FSRS(fsrs.ts, "언제 복습할지")와는
// 독립된 축이다 — 이 파일은 "지금 이 단어를 얼마나 아는가"만 다룬다.
//
// 승급: 같은 레벨에서 서로 다른 세션 3회 연속 정답 시 +1 (최대 5).
// 강등: 오답 시 -1, 2연속 오답 시 -2 (최저 1 — 한 번이라도 접한 단어는 0으로 돌아가지 않는다).
// 같은 세션 안에서 같은 단어를 여러 번 맞혀도 세션 1회로만 집계된다.
//   → "같은 세션 안에서 연속 승급 처리 금지" 규칙은 이 방식으로 구조적으로 이미 지켜진다.
//
// 상태 표현(v2, Stage 3에서 수정): 승급까지 필요한 "서로 다른 세션" 목록을 배열로
// 들고 있던 v1(Stage 2 최초 버전) 대신, consecutiveCorrect(개수) + lastSessionId
// (마지막으로 집계한 세션)만 저장한다. 이 접근에서 배열은 항상 "현재 세션이 이미
// 들어있는가"만 확인하므로 개수+마지막세션ID로도 완전히 동일하게 동작하고,
// user_word_states 테이블의 정수 컬럼에 그대로 저장할 수 있다.

import type { MasteryLevel } from "./types";

export type MasteryState = {
  level: MasteryLevel;
  consecutiveWrong: number;
  consecutiveCorrect: number; // 서로 다른 세션에서 연속 정답한 횟수(승급까지 3 필요)
  lastSessionId: string | null; // 방금 집계에 반영한 세션. 같은 세션 재답변 시 중복집계 방지
};

const MAX_LEVEL: MasteryLevel = 5;
const MIN_ENGAGED_LEVEL = 1; // 한 번 접한 단어의 강등 최저치(0=미학습으로는 안 돌아감)
const REQUIRED_DISTINCT_SESSIONS = 3;

export function initialMasteryState(): MasteryState {
  return { level: 0, consecutiveWrong: 0, consecutiveCorrect: 0, lastSessionId: null };
}

export function applyAnswer(
  state: MasteryState,
  params: { sessionId: string; isCorrect: boolean }
): { next: MasteryState; leveledUp: boolean; leveledDown: boolean } {
  let level = state.level;
  let consecutiveWrong = state.consecutiveWrong;
  let consecutiveCorrect = state.consecutiveCorrect;
  let lastSessionId = state.lastSessionId;
  let leveledUp = false;
  let leveledDown = false;

  // 미학습(0) 단어를 처음 접하면 곧바로 "인지(1)" 단계로 진입한다.
  if (level === 0) {
    level = MIN_ENGAGED_LEVEL;
  }

  if (params.isCorrect) {
    consecutiveWrong = 0;
    if (params.sessionId !== lastSessionId) {
      consecutiveCorrect += 1;
      lastSessionId = params.sessionId;
    }
    if (consecutiveCorrect >= REQUIRED_DISTINCT_SESSIONS) {
      if (level < MAX_LEVEL) {
        level = (level + 1) as MasteryLevel;
        leveledUp = true;
      }
      consecutiveCorrect = 0;
      lastSessionId = null;
    }
  } else {
    consecutiveCorrect = 0;
    lastSessionId = null;
    consecutiveWrong += 1;
    const drop = consecutiveWrong >= 2 ? 2 : 1;
    const newLevel = Math.max(MIN_ENGAGED_LEVEL, level - drop) as MasteryLevel;
    leveledDown = newLevel < level;
    level = newLevel;
  }

  return {
    next: { level, consecutiveWrong, consecutiveCorrect, lastSessionId },
    leveledUp,
    leveledDown,
  };
}
