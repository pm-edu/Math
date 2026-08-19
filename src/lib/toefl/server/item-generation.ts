// TOEFL 문항 생성의 공개 창구(facade).
//
// 2026-08-19 리팩터: 이 파일에 프롬프트·해석 로직이 유형별 if문으로 모여 있었는데, 유형이
// 12개로 늘면 감당이 안 되고 화면에도 같은 목록이 복제돼 있었다. 로직은 유형별 생성기로
// 옮기고(server/generators/), 메타데이터는 task-catalog 로 모았다. 이 파일은 기존 호출부가
// 그대로 동작하도록 얇게 위임만 한다.
//
// 새 유형을 추가할 때 손댈 곳: task-catalog.ts(목록) + generators/(동작) — 이 파일은 아니다.

import { getGenerator } from "./generators/registry";
import type { ItemDraft, ParsedDrafts, StimulusDraft } from "./generators/types";

export type { ItemDraft, ParsedDrafts, StimulusDraft };
export type { BlankDraft, McqOptionDraft, ItemGenerator } from "./generators/types";
export { GENERATOR_LIST, generatorsForSection, getGenerator } from "./generators/registry";

/** 생성기가 붙어 있는 유형만 좁힌 타입. */
export type GenerableTaskType = string;

/**
 * 예전 이름 유지 — 관리 화면·라우트가 "유형 설정"을 이 이름으로 찾는다.
 * value/label/section/needsStimulus 네 칸은 생성기가 카탈로그에서 그대로 물려받은 값이다.
 */
export function taskTypeConfig(taskType: string) {
  const g = getGenerator(taskType);
  if (!g) return null;
  return {
    value: g.taskType,
    label: g.label,
    section: g.section,
    needsStimulus: g.needsStimulus,
    stimulusAudio: g.stimulusAudio,
    scoringMode: g.scoringMode,
  };
}

export function buildGenerationPrompt(
  taskType: string,
  opts: { itemsPerUnit: number; topic?: string; difficulty: number }
): string {
  const g = getGenerator(taskType);
  if (!g) throw new Error(`지원하지 않는 문항 유형입니다: ${taskType}`);
  return g.buildPrompt(opts);
}

export type ParseResult =
  | { ok: true; stimulus: StimulusDraft | null; items: ItemDraft[] }
  | { ok: false; message: string };

/** Gemini 가 돌려준 JSON 문자열을 유형별 생성기에게 넘겨 초안 목록으로 만든다. */
export function parseGeneratedJson(taskType: string, text: string): ParseResult {
  const g = getGenerator(taskType);
  if (!g) return { ok: false, message: `지원하지 않는 문항 유형입니다: ${taskType}` };

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "생성 결과를 JSON으로 해석하지 못했습니다. 다시 시도해주세요." };
  }
  return g.parse((data ?? {}) as Record<string, unknown>);
}
