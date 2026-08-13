// 문항 생성기들이 공유하는 작은 헬퍼.

// 문장에서 단어를 낱말 경계 기준으로 찾아 빈칸으로 바꾼다.
// \b(낱말 경계)를 써서 "cat"이 "concatenated" 안의 일부까지 지우지 않는다.
//
// 예문은 자연스러운 문장이라 원형이 아니라 활용형으로 등장하는 경우가 많다
// (accept → "She accepted...", arrive → "We arrived..."). 정확히 일치하는
// 형태를 먼저 찾고, 없으면 흔한 규칙활용(-s/-es/-ed/-d/-ing)까지 시도한다.
// 그래도 못 찾으면(불규칙 활용 등) null을 반환한다 — 호출자가 빈칸을 만들 수
// 없는 문장이라는 뜻이므로 CLOZE/CONTRAST 대신 다른 문항 유형으로 대체해야 한다.
export function blankOut(sentence: string, lemma: string): string | null {
  const escaped = escapeRegExp(lemma);

  const exact = new RegExp(`\\b${escaped}\\b`, "i");
  if (exact.test(sentence)) return sentence.replace(exact, "_____");

  const inflected = new RegExp(`\\b${escaped}(?:ies|ied|ing|es|ed|s|d)?\\b`, "i");
  if (inflected.test(sentence)) return sentence.replace(inflected, "_____");

  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
