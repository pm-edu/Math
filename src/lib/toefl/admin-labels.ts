// 관리 화면에서 쓰는 영역 표시(색·라벨). docs/toefl-admin.html 의 .qtag 계열.
//
// 학생 화면은 i18n 사전(useLang)을 쓰지만 관리 화면은 한국어 전용이라 여기서 직접 정한다.
// 색은 하드코딩하지 않고 globals.css 의 --en-read/listen/speak/write 를 참조한다.

import type { ToeflSection } from "@/lib/toefl/types";

export const SECTION_TAG: Record<ToeflSection, { label: string; short: string; tag: string; color: string }> = {
  reading: { label: "Reading", short: "R", tag: "READ", color: "var(--en-read)" },
  listening: { label: "Listening", short: "L", tag: "LSTN", color: "var(--en-listen)" },
  speaking: { label: "Speaking", short: "S", tag: "SPK", color: "var(--en-speak)" },
  writing: { label: "Writing", short: "W", tag: "WRT", color: "var(--en-write)" },
};

export const SECTION_ORDER: ToeflSection[] = ["reading", "listening", "speaking", "writing"];

// DB enum: toefl_stage = stage1|stage2, toefl_route = base|easy|hard.
// Stage 1은 전원 같은 난이도라 route가 항상 base — 그때는 경로를 안 붙인다.
const ROUTE_LABEL: Record<string, string> = { hard: "Hard", easy: "Easy", base: "Base" };

/** stage/route 를 사람이 읽는 한 덩어리로. 예: stage2 + hard → "Stage 2 · Hard" */
export function moduleLabel(stage: string, route: string): string {
  const s = stage === "stage1" ? "Stage 1" : stage === "stage2" ? "Stage 2" : stage;
  if (route === "base") return s;
  return `${s} · ${ROUTE_LABEL[route] ?? route}`;
}

/** 라우팅 결과를 학생 관리 표에서 쓰는 짧은 말로. hard=상한 없음, easy=밴드 4.0 상한. */
export function routeLabel(route: string | null): string | null {
  if (route === "hard") return "상급";
  if (route === "easy") return "하급";
  return null;
}
