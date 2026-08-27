// 문항 1개 자동채점. docs/toefl-spec.md §6(과제 유형별 데이터 계약) §7(채점 엔진 규칙) 그대로.
// 순수 함수 — DB/네트워크 접근 금지 (CLAUDE.md 공통 규칙).
// ai_rubric(take_an_interview/write_an_email/academic_discussion)은 자동채점 대상이 아니다
// (§12 AI 채점 파이프라인은 P3/P4에서 별도로 구현) — 여기서는 pointsEarned 0, isCorrect null을 반환한다.

import type {
  BuildASentenceAnswer,
  CompleteTheWordsAnswerKey,
  EssayAnswer,
  ReadingMcqAnswer,
  ToeflAnswer,
  ToeflAnswerKey,
  ToeflItemPayload,
  ToeflScoringMode,
  ToeflTaskType,
} from "../types";
import { round2 } from "./round";

export type ScoreableItem = {
  task_type: ToeflTaskType;
  scoring_mode: ToeflScoringMode;
  points: number;
  answer_key: ToeflAnswerKey | null;
  // scoreMcqLike가 multi_select인지 판정하는 데 쓴다(§6). listen_and_repeat 등 payload가 채점에
  // 안 쓰이는 유형은 호출자가 안 넘겨도 되게 optional로 뒀다(server/audio-grading.ts 참고).
  payload?: ToeflItemPayload;
};

// 2026-08-27 교차검증(B2) — ToeflAnswer에 있던 `Record<string, unknown>` 탈출구를 없앤 대신,
// 여기서 실제 형태를 확인하는 타입가드를 쓴다. 형태가 안 맞으면(버그·손상된 데이터) 조용히
// 잘못된 값을 채점에 쓰는 대신 "빈 답안"으로 취급해 0점 처리한다.
function isReadingMcqAnswer(a: ToeflAnswer | null): a is ReadingMcqAnswer {
  return !!a && typeof a === "object" && Array.isArray((a as ReadingMcqAnswer).selected);
}

function isBuildASentenceAnswer(a: ToeflAnswer | null): a is BuildASentenceAnswer {
  return !!a && typeof a === "object" && Array.isArray((a as BuildASentenceAnswer).order);
}

function isEssayAnswer(a: ToeflAnswer | null): a is EssayAnswer {
  return !!a && typeof a === "object" && typeof (a as EssayAnswer).text === "string";
}

// complete_the_words 답안({b1:"economy", b2:"introduced"})은 blank id가 스키마마다 달라 구조로
// 구분할 수 없다 — 위 세 타입 중 어느 것도 아니면(selected/order/text 키가 없으면) 이 형태로 본다.
function isBlankAnswer(a: ToeflAnswer | null): a is CompleteTheWordsAnswerKey {
  return !!a && typeof a === "object" && !isReadingMcqAnswer(a) && !isBuildASentenceAnswer(a) && !isEssayAnswer(a);
}

export type ScoreableResponse = {
  answer: ToeflAnswer | null;
  transcript?: string | null; // auto_transcript(listen_and_repeat) 전용 — STT 결과
};

export type ScoreResult = { isCorrect: boolean | null; pointsEarned: number };

// daily_life/academic_passage(reading)와 choose_a_response/conversation/announcement/academic_talk
// (listening)는 payload/answer_key 구조가 동일하다(§6: {correct:[...]} / {selected:[...]}).
const MCQ_LIKE_TASK_TYPES: ToeflTaskType[] = [
  "daily_life",
  "academic_passage",
  "choose_a_response",
  "conversation",
  "announcement",
  "academic_talk",
];

export function scoreItem(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  if (item.task_type === "complete_the_words") return scoreCompleteTheWords(item, response);
  if (MCQ_LIKE_TASK_TYPES.includes(item.task_type)) return scoreMcqLike(item, response);
  if (item.task_type === "build_a_sentence") return scoreBuildASentence(item, response);
  if (item.task_type === "listen_and_repeat") return scoreListenAndRepeat(item, response);
  // take_an_interview / write_an_email / academic_discussion(ai_rubric)
  return { isCorrect: null, pointsEarned: 0 };
}

function scoreCompleteTheWords(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as Record<string, string>;
  const ans: CompleteTheWordsAnswerKey = isBlankAnswer(response.answer) ? response.answer : {};
  const blankIds = Object.keys(key);
  if (blankIds.length === 0) return { isCorrect: null, pointsEarned: 0 };

  const matched = blankIds.filter((id) => normWord(ans[id]) === normWord(key[id])).length;
  const isCorrect = matched === blankIds.length;
  const pointsEarned = round2((matched / blankIds.length) * item.points);
  return { isCorrect, pointsEarned };
}

function scoreMcqLike(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as { correct?: string[] };
  const correct = key.correct ?? [];
  if (correct.length === 0) return { isCorrect: null, pointsEarned: 0 };

  const selected = isReadingMcqAnswer(response.answer) ? response.answer.selected : [];
  // format은 §6 계약대로 payload에서 판정한다(2026-08-27 교차검증 B3) — 이전엔 answer_key의
  // correct 배열 길이(1개면 단일, 2개+면 multi)로 암묵 추정했는데, payload가 진짜 출처다.
  // choose_a_response(payload에 format 자체가 없음)는 항상 단일 정답이라 기본값이 그대로 맞는다.
  const format = (item.payload as { format?: string } | undefined)?.format;
  const isMultiSelect = format === "multi_select";

  if (!isMultiSelect) {
    // 단일 정답(mcq/insert_text/replay 포함) — 완전 일치만 인정.
    const isCorrect = selected.length === 1 && selected[0] === correct[0];
    return { isCorrect, pointsEarned: isCorrect ? item.points : 0 };
  }

  // multi_select — 부분점수: (맞춘 개수 - 틀리게 고른 개수) / 정답 개수 * 배점 (0 미만은 0으로 자름).
  // 예전엔 오답을 추가로 골라도 isCorrect만 false로 만들고 pointsEarned는 그대로 만점을 줬다
  // (matchedCount/correct.length가 1이면 오답을 더 골랐어도 ratio*points가 만점이 나옴) —
  // 실제 버그였다(2026-08-27 교차검증 A1). 이제 틀리게 고른 개수만큼 점수에서도 뺀다.
  const matchedCount = selected.filter((s) => correct.includes(s)).length;
  const wrongCount = selected.filter((s) => !correct.includes(s)).length;
  const ratio = Math.max(0, matchedCount - wrongCount) / correct.length;
  const isCorrect = ratio === 1 && wrongCount === 0;
  return { isCorrect, pointsEarned: round2(ratio * item.points) };
}

function scoreBuildASentence(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as { order?: string[]; accepted_alternatives?: string[][] };
  const order = isBuildASentenceAnswer(response.answer) ? response.answer.order : [];
  if (!key.order || key.order.length === 0) return { isCorrect: null, pointsEarned: 0 };

  const isCorrect =
    arraysEqualOrdered(order, key.order) ||
    (key.accepted_alternatives ?? []).some((alt) => arraysEqualOrdered(order, alt));
  return { isCorrect, pointsEarned: isCorrect ? item.points : 0 };
}

function scoreListenAndRepeat(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as { target_sentence?: string };
  if (!key.target_sentence) return { isCorrect: null, pointsEarned: 0 };

  const accuracy = wordAccuracy(response.transcript ?? "", key.target_sentence);
  // 0.9는 스펙에 근거 수치가 없는 임의 값이다(2026-08-27 교차검증 확인 — 필요하면 실사용
  // 데이터가 쌓인 뒤 조정할 것, 지금은 "거의 정확히 따라 말함"의 상식적 기준으로 잡아둔 것).
  // Delivery(발음)는 별도 ai_rubric이 참고용으로 병합한다(§12).
  const isCorrect = accuracy >= 0.9;
  return { isCorrect, pointsEarned: round2(accuracy * item.points) };
}

function normWord(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function arraysEqualOrdered(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
}

// 단어 오류율(WER, Word Error Rate) 기반 정확도. 목표 문장(ref) 대비 학생 발화(hyp)를 단어 단위
// 편집거리(Levenshtein)로 맞춰 대치(substitution)·삭제(deletion)·삽입(insertion)을 전부 센다.
//
// 이전엔 최장 공통 부분수열(LCS) 길이 / 목표 문장 단어 수로만 계산했는데, 그러면 목표 문장에
// 없는 단어를 학생이 덧붙여 말해도(삽입 오류) lcs/목표길이 비율이 그대로라 감점이 전혀 없었다
// (2026-08-27 교차검증 지적, 사용자 확정: WER로 교체). WER = 편집거리 / 목표 문장 단어 수,
// accuracy = 1 - WER(0 미만은 0으로 자름 — 삽입이 아주 많으면 편집거리가 목표길이를 넘을 수 있음).
function wordAccuracy(transcript: string, target: string): number {
  const hyp = tokenize(transcript);
  const ref = tokenize(target);
  if (ref.length === 0) return 0;
  if (hyp.length === 0) return 0;

  const dp: number[][] = Array.from({ length: ref.length + 1 }, () => new Array(hyp.length + 1).fill(0));
  for (let i = 0; i <= ref.length; i++) dp[i][0] = i;
  for (let j = 0; j <= hyp.length; j++) dp[0][j] = j;
  for (let i = 1; i <= ref.length; i++) {
    for (let j = 1; j <= hyp.length; j++) {
      dp[i][j] =
        ref[i - 1] === hyp[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]); // 대치·삭제·삽입 중 최소 비용
    }
  }
  const editDistance = dp[ref.length][hyp.length];
  const wer = editDistance / ref.length;
  return Math.max(0, 1 - wer);
}
