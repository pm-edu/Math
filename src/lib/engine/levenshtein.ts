// 편집 거리(Levenshtein distance). 순수 함수, 외부 의존 없음.
// 쓰임: 1) 주관식 채점의 "근접 오타" 판정(rating.ts) 2) 오답 선택지의 철자 유사도(distractors.ts)

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // 삭제
        curr[j - 1] + 1, // 삽입
        prev[j - 1] + cost // 치환
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
