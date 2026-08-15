// Stage1 → Stage2 적응형 라우팅 판정. docs/toefl-spec.md §8.
// 순수 함수 — 실제 라우팅 계산은 반드시 서버(Route Handler)에서 이 함수를 호출해 수행하고,
// 클라이언트에는 결과(easy/hard)를 알려주지 않는다(§8 5번 규칙).

export function routeStage2(stage1Raw: number, threshold: number): "easy" | "hard" {
  return stage1Raw >= threshold ? "hard" : "easy";
}
