// 영역별 강약점 요약(리포트 화면). skill_tags(answer_key 옆의 staff-only 컬럼)별 정답률을 집계해
// 약점/강점 태그를 뽑는다. 순수 함수 — DB 접근 없음, 호출자(insights 라우트)가 이미 조회한
// item.skill_tags + response.is_correct를 넘긴다. "리포트를 클라이언트에서 재계산하지 않는다"는
// 요청 때문에 이 집계는 서버(API 라우트)에서만 돌리고 결과만 클라이언트로 내려준다.

export type SkillTagEntry = { skillTags: string[]; isCorrect: boolean | null };
export type SkillTagStat = { tag: string; correct: number; total: number; accuracy: number };

const MIN_SAMPLE = 2; // 표본 1개짜리 태그로 "약점"이라 단정하지 않는다
const WEAK_THRESHOLD = 0.6;
const STRONG_THRESHOLD = 0.8;
const MAX_TAGS = 3;

export function summarizeSkillTags(entries: SkillTagEntry[]): { weak: SkillTagStat[]; strong: SkillTagStat[] } {
  const byTag = new Map<string, { correct: number; total: number }>();

  for (const entry of entries) {
    if (entry.isCorrect === null) continue; // 미채점/미응답은 집계 제외
    for (const tag of entry.skillTags) {
      const stat = byTag.get(tag) ?? { correct: 0, total: 0 };
      stat.total += 1;
      if (entry.isCorrect) stat.correct += 1;
      byTag.set(tag, stat);
    }
  }

  const stats: SkillTagStat[] = [...byTag.entries()]
    .filter(([, s]) => s.total >= MIN_SAMPLE)
    .map(([tag, s]) => ({ tag, correct: s.correct, total: s.total, accuracy: s.correct / s.total }));

  const weak = stats
    .filter((s) => s.accuracy < WEAK_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, MAX_TAGS);

  const strong = stats
    .filter((s) => s.accuracy >= STRONG_THRESHOLD)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, MAX_TAGS);

  return { weak, strong };
}
