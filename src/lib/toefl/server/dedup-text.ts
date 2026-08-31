// 중복검사용 텍스트 추출. toefl_item.payload는 유형마다 모양이 다르지만(mcq_passage의
// options, complete_the_words의 paragraph, write_an_email의 scenario…) 전부 "학생에게
// 그대로 보여줘도 되는 내용"만 들어있다(정답·해설은 별도 컬럼) — 그래서 유형별로 따로 파싱하는
// 대신 payload 전체를 재귀적으로 훑어 문자열만 모으는 범용 방식을 쓴다([[toefl-item-pipeline-project]]
// Phase 3). audio_path/clip_path/id 류는 내용이 아니라 제외한다.
//
// 예외: choose_a_response는 실제로 들려주는 문장(spoken_text)이 보안상 payload에 아예
// 저장되지 않는다(§5, 듣기 전에 읽어버리는 것 방지) — 대량생성 파이프라인이 저장 시점에
// 이 값을 버려서(2026-08-31 발견, generation-shortfall.ts는 spokenText를 받지 않고
// 버림) 지금은 복구 불가능하다. 이 유형은 대신 보기(options) 텍스트로 대체한다 — 완벽하진
// 않지만 없는 것보단 낫고, 애초에 이 유형은 오디오 자체를 다시 만들 방법이 없어 별도 정리가
// 필요하다(메모리 참고).

const EXCLUDED_KEYS = new Set(["id", "clip_path", "audio_path", "question_audio_path", "format", "select_count"]);

function collectStrings(value: unknown, out: string[], keyHint?: string): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (keyHint && EXCLUDED_KEYS.has(keyHint)) return;
    const t = value.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, keyHint);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) collectStrings(v, out, k);
  }
}

export type DedupTextInput = {
  prompt: string;
  payload: unknown;
  stimulus: { title: string | null; body: string | null; transcript: string | null } | null;
};

export function buildDedupText(input: DedupTextInput): string {
  const parts: string[] = [];
  if (input.stimulus) {
    if (input.stimulus.title) parts.push(input.stimulus.title);
    if (input.stimulus.body) parts.push(input.stimulus.body);
    if (input.stimulus.transcript) parts.push(input.stimulus.transcript);
  }
  parts.push(input.prompt);
  collectStrings(input.payload, parts);
  return parts.join("\n").slice(0, 8000); // 임베딩 입력 길이 안전판(과금·모델 한도 대비 여유)
}
