// 혼동쌍 탐지(Confusion Pair Detection) — 이 제품의 시그니처 기능.
// MC/CONTRAST형 오답 로그에서 "이 단어를 묻는 문제에서 저 단어의 뜻/철자를 골랐다"를
// 집계해 학생별 혼동 행렬을 만든다. CONTRAST 문항(items/contrast.ts)의 재료가 된다.
//
// 콜드스타트 대응: 신규 학생은 개인화 이력이 0이므로, DB에 미리 심어둔(user_id=null)
// 알려진 혼동쌍(confusions 테이블, supabase/migrations 시드 참고)으로 1일차부터
// CONTRAST 문항을 낼 수 있게 한다. 개인화 데이터가 쌓이면 그쪽을 우선한다.

export type ConfusionCount = { wordId: string; confusedWithWordId: string; count: number };
export type SeedConfusion = { wordId: string; confusedWithWordId: string };

export function detectConfusions(
  entries: Array<{ wordId: string; chosenWordId: string | null; isCorrect: boolean }>
): ConfusionCount[] {
  const counts = new Map<string, number>();

  for (const e of entries) {
    if (e.isCorrect || !e.chosenWordId || e.chosenWordId === e.wordId) continue;
    const key = `${e.wordId}::${e.chosenWordId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [wordId, confusedWithWordId] = key.split("::");
    return { wordId, confusedWithWordId, count };
  });
}

// 이 단어의 CONTRAST 문항 상대를 고른다: 개인화 혼동 이력이 있으면 가장 많이 혼동한
// 단어, 없으면 시드 혼동쌍, 둘 다 없으면 null(이 단어는 CONTRAST를 만들 수 없음).
export function pickConfusionPartner(
  wordId: string,
  personal: ConfusionCount[],
  seed: SeedConfusion[]
): string | null {
  const personalMatches = personal
    .filter((c) => c.wordId === wordId)
    .sort((a, b) => b.count - a.count);
  if (personalMatches.length > 0) return personalMatches[0].confusedWithWordId;

  const seedMatch = seed.find((c) => c.wordId === wordId);
  return seedMatch ? seedMatch.confusedWithWordId : null;
}
