// 채점 결과 + 반응시간 + 근접오타 여부에서 FSRS 등급(rating)을 자동 산출한다.
// 학생이 스스로 등급을 매기지 않는다(완전학습 핵심 원칙 1) — 여기서만 등급이 정해진다.
//
// 산출 규칙: 정답&빠름=easy / 정답&느림=good / 정답이지만 오타·힌트사용(근접오타)=hard / 오답=again
//
// 주의(설계 메모): 3초 같은 고정 임계값은 신중한 학생을 부당하게 낮게 평가할 수 있다.
// v1은 보수적인 기본값 하나로 시작하고, 개인화(학생별 롤링 중앙값 반응시간)는
// fastThresholdMs 파라미터로 나중에 주입한다(이 함수 시그니처를 바꾸지 않아도 됨).

import { levenshtein } from "./levenshtein";
import type { FsrsRating, GradeResult } from "./types";

export const DEFAULT_FAST_THRESHOLD_MS = 4000;

// 오답으로 정답 처리를 허용할 최대 편집거리(오타 1글자까지는 "근접오타"로 정답 인정)
export const NEAR_MISS_MAX_DISTANCE = 1;

export function deriveRating(params: {
  isCorrect: boolean;
  responseMs?: number;
  nearMiss?: boolean; // 정답이지만 철자가 완전하지 않았던 경우(주관식 근접오타 등)
  fastThresholdMs?: number;
}): FsrsRating {
  const { isCorrect, responseMs, nearMiss = false, fastThresholdMs = DEFAULT_FAST_THRESHOLD_MS } = params;

  if (!isCorrect) return "again";
  if (nearMiss) return "hard";
  if (responseMs === undefined) return "good"; // 반응시간을 측정 못했으면 보수적으로 good
  return responseMs <= fastThresholdMs ? "easy" : "good";
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

// 주관식(뜻→영어 타이핑, 빈칸채우기 CLOZE)의 공통 채점 로직.
// 정확히 일치 = 정답. 편집거리 1(오타 한 글자)까지는 정답으로 인정하되 hard로 채점해
// "다시 정확히 써봐야 완전히 아는 것"이라는 신호를 남긴다.
export function gradeTyped(
  correctAnswer: string,
  typed: string,
  responseMs?: number,
  fastThresholdMs?: number
): GradeResult {
  const a = normalize(correctAnswer);
  const b = normalize(typed);
  const editDistance = levenshtein(a, b);

  if (b.length === 0) {
    return { isCorrect: false, rating: "again", detail: { editDistance } };
  }

  if (editDistance === 0) {
    const rating = deriveRating({ isCorrect: true, responseMs, fastThresholdMs });
    return { isCorrect: true, rating, detail: { editDistance } };
  }

  if (editDistance <= NEAR_MISS_MAX_DISTANCE) {
    return { isCorrect: true, rating: "hard", detail: { editDistance, nearMiss: true } };
  }

  return { isCorrect: false, rating: "again", detail: { editDistance } };
}
