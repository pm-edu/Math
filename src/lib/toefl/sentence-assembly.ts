// build_a_sentence 조각(chunk) 배열을 사람이 읽을 문장으로 조립한다. 구두점 카드 앞에는
// 공백을 안 붙인다(2026-08-18 요청). BuildASentence.tsx(응시 화면)와 리뷰 화면 둘 다 같은
// 조립 규칙을 써야 해서(안 그러면 응시 때 본 문장과 리뷰 때 보는 문장 모양이 달라짐) 공용으로 뺐다.

export function isPunctuationChunk(text: string): boolean {
  return /^[.,!?;:]$/.test(text.trim());
}

export function assembleSentence(order: string[], chunkById: Map<string, { id: string; text: string }>): string {
  let out = "";
  for (const id of order) {
    const text = chunkById.get(id)?.text ?? "";
    if (!text) continue;
    if (out.length === 0 || isPunctuationChunk(text)) out += text;
    else out += ` ${text}`;
  }
  return out;
}
