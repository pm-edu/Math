// 문항 생성기들이 공유하는 작은 헬퍼.

// 문장에서 단어를 낱말 경계 기준으로 찾아 빈칸으로 바꾼다.
// \b(낱말 경계)를 써서 "cat"이 "concatenated" 안의 일부까지 지우지 않는다.
export function blankOut(sentence: string, lemma: string): string {
  const wordBoundary = new RegExp(`\\b${escapeRegExp(lemma)}\\b`, "i");
  return sentence.replace(wordBoundary, "_____");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
