// SAT 채점 함수(MCQ + SPR). 순수 함수만 — DB·네트워크·전역 상태 접근 금지.

import { isSprCorrect, parseSpr, type Rational, type SprErrorCode } from "./spr";

export type AnswerKey =
  | { type: "mcq"; correct: string }
  | { type: "spr"; accepted: Rational[]; tolerance?: { min: Rational; max: Rational } };

export interface GradeResult {
  isCorrect: boolean;
  normalized: string | null;
  errorCode: SprErrorCode | null;
}

function normalizeMcqAnswer(value: string): string {
  return value.trim().toUpperCase();
}

function isWithinTolerance(value: Rational, tolerance: { min: Rational; max: Rational }): boolean {
  // a/b <= c/d  <=>  a*d <= c*b (분모는 항상 양수이므로 부호 걱정 없이 교차곱 비교 가능)
  const geMin = value.n * tolerance.min.d >= tolerance.min.n * value.d;
  const leMax = value.n * tolerance.max.d <= tolerance.max.n * value.d;
  return geMin && leMax;
}

function gradeMcq(key: Extract<AnswerKey, { type: "mcq" }>, input: string): GradeResult {
  const normalized = normalizeMcqAnswer(input);
  return {
    isCorrect: normalized === normalizeMcqAnswer(key.correct),
    normalized,
    errorCode: null,
  };
}

function gradeSpr(key: Extract<AnswerKey, { type: "spr" }>, input: string): GradeResult {
  const parsed = parseSpr(input);
  if (!parsed.ok) {
    // 파싱 실패는 오답 처리하되 errorCode를 남긴다 — "형식 오류로 틀린 비율" 분석용(지시서 §4).
    return { isCorrect: false, normalized: null, errorCode: parsed.reason };
  }

  const matchesAccepted = key.accepted.some((accepted) => isSprCorrect(input, accepted));
  const matchesTolerance = key.tolerance ? isWithinTolerance(parsed.value, key.tolerance) : false;

  return {
    isCorrect: matchesAccepted || matchesTolerance,
    normalized: parsed.canonical,
    errorCode: null,
  };
}

export function gradeResponse(key: AnswerKey, input: string): GradeResult {
  return key.type === "mcq" ? gradeMcq(key, input) : gradeSpr(key, input);
}
