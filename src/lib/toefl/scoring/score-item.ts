// 문항 1개 자동채점. docs/toefl-spec.md §6(과제 유형별 데이터 계약) §7(채점 엔진 규칙) 그대로.
// 순수 함수 — DB/네트워크 접근 금지 (CLAUDE.md 공통 규칙).
// ai_rubric(take_an_interview/write_an_email/academic_discussion)은 자동채점 대상이 아니다
// (§12 AI 채점 파이프라인은 P3/P4에서 별도로 구현) — 여기서는 pointsEarned 0, isCorrect null을 반환한다.

import type { ToeflAnswer, ToeflAnswerKey, ToeflScoringMode, ToeflTaskType } from "../types";
import { round2 } from "./round";

export type ScoreableItem = {
  task_type: ToeflTaskType;
  scoring_mode: ToeflScoringMode;
  points: number;
  answer_key: ToeflAnswerKey | null;
};

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
  const ans = (response.answer ?? {}) as Record<string, string>;
  const blankIds = Object.keys(key);
  if (blankIds.length === 0) return { isCorrect: null, pointsEarned: 0 };

  const matched = blankIds.filter((id) => normWord(ans[id]) === normWord(key[id])).length;
  const isCorrect = matched === blankIds.length;
  const pointsEarned = round2((matched / blankIds.length) * item.points);
  return { isCorrect, pointsEarned };
}

function scoreMcqLike(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as { correct?: string[] };
  const ans = (response.answer ?? {}) as { selected?: string[] };
  const correct = key.correct ?? [];
  const selected = ans.selected ?? [];
  if (correct.length === 0) return { isCorrect: null, pointsEarned: 0 };

  if (correct.length === 1) {
    // 단일 정답(mcq/insert_text/replay 포함) — 완전 일치만 인정
    const isCorrect = selected.length === 1 && selected[0] === correct[0];
    return { isCorrect, pointsEarned: isCorrect ? item.points : 0 };
  }

  // multi_select — 부분점수: (맞춘 개수 / 정답 개수) * 배점. 오답을 추가로 골랐으면 만점 인정 안 함.
  const matchedCount = selected.filter((s) => correct.includes(s)).length;
  const hasWrongPick = selected.some((s) => !correct.includes(s));
  const ratio = matchedCount / correct.length;
  const isCorrect = ratio === 1 && !hasWrongPick;
  return { isCorrect, pointsEarned: round2(ratio * item.points) };
}

function scoreBuildASentence(item: ScoreableItem, response: ScoreableResponse): ScoreResult {
  const key = (item.answer_key ?? {}) as { order?: string[]; accepted_alternatives?: string[][] };
  const ans = (response.answer ?? {}) as { order?: string[] };
  const order = ans.order ?? [];
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
  // 0.9 이상을 "정확히 따라 말함"으로 본다 — Delivery(발음)는 별도 ai_rubric이 참고용으로 병합한다(§12).
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

// 단어 정렬 정확도의 단순화 근사치: 최장 공통 부분수열(LCS) 길이 / 목표 문장 단어 수.
// 정식 WER(단어 오류율) 대신 쓰는 것으로, 실사용 데이터가 쌓이면 교체를 검토한다(fsrs.ts와 같은 방식의 설계 메모).
function wordAccuracy(transcript: string, target: string): number {
  const a = tokenize(transcript);
  const b = tokenize(target);
  if (b.length === 0) return 0;
  if (a.length === 0) return 0;

  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[a.length][b.length];
  return Math.min(1, lcs / b.length);
}
