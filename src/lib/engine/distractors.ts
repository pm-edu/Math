// 오답 선택지(distractor) 생성. 무작위 금지 — 우선순위:
// 1) 이 학생이 실제로 혼동한 적 있는 단어(confusions)
// 2) 철자 유사(edit distance)
// 3) 나머지(같은 유닛 후보 등, 호출자가 이미 좁혀서 넘긴 pool) 중 무작위
//
// "같은 유닛 단어"는 이 함수가 스스로 판단하지 않는다 — 호출자(문항 생성기)가
// 이미 같은 유닛으로 좁힌 pool을 넘기는 것을 전제로 한다.
// "의미 유사"(우선순위 3)는 임베딩 등 외부 판단이 필요해 MVP 범위 밖으로 미룬다(Stage 7 검토).

import { levenshtein } from "./levenshtein";

export type DistractorCandidate<T> = {
  item: T;
  key: string; // 비교 기준값(뜻 텍스트, lemma 등 — 호출자가 정한다)
  isConfusion?: boolean; // 이 학생이 실제로 혼동한 적 있는 후보인가
};

const EDIT_DISTANCE_CLOSE = 2; // 이 이하면 "철자 유사"로 간주

export function selectDistractors<T>(
  targetKey: string,
  candidates: DistractorCandidate<T>[],
  count: number,
  opts?: { rng?: () => number }
): T[] {
  const rng = opts?.rng ?? Math.random;

  const pool = candidates.filter((c) => c.key !== targetKey);

  const confusionTier = pool.filter((c) => c.isConfusion);
  const closeSpellingTier = pool.filter(
    (c) => !c.isConfusion && levenshtein(targetKey, c.key) <= EDIT_DISTANCE_CLOSE
  );
  const restTier = pool.filter(
    (c) => !c.isConfusion && levenshtein(targetKey, c.key) > EDIT_DISTANCE_CLOSE
  );

  const picked: DistractorCandidate<T>[] = [];
  const usedKeys = new Set<string>();

  function takeFrom(tier: DistractorCandidate<T>[]) {
    for (const c of tier) {
      if (picked.length >= count) return;
      if (usedKeys.has(c.key)) continue;
      picked.push(c);
      usedKeys.add(c.key);
    }
  }

  takeFrom(confusionTier);
  takeFrom(closeSpellingTier);

  if (picked.length < count) {
    // 나머지는 무작위로. 결정적 테스트를 위해 rng 주입 가능.
    const shuffled = shuffle(restTier, rng);
    takeFrom(shuffled);
  }

  return picked.slice(0, count).map((c) => c.item);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
