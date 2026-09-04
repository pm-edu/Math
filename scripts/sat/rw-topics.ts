/**
 * SAT RW 소재 목록 생성기 — 지시서 SAT P1 §1.
 *
 * "소재 없이 스킬별로 바로 생성하면 같은 지문이 스킬만 바꿔 반복된다"를 막기 위해, 문항
 * 생성 전에 (주제 × 장르 × 시대) 조합 200개를 먼저 확정해서 파일로 고정해둔다. 소재 하나당
 * 문항 1개 원칙이라, 이 목록의 각 행이 곧 생성될 지문 하나의 "브리프"가 된다.
 *
 * 결정론적 시드 셔플(LCG, 새 의존성 없음)로 40(주제) × 10(장르) × 8(시대) = 3200개 조합 중
 * 200개를 중복 없이 뽑는다 — 같은 시드면 항상 같은 200개가 나온다.
 *
 * 실행: npx tsx scripts/sat/rw-topics.ts
 * 출력: scripts/sat/data/rw-topics.json (커밋 대상 — generate.ts가 이 파일을 읽는다)
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RwTopic } from "@/lib/sat/server/rw-prompt";

const SEED = 20260904; // 오늘 날짜를 시드로 고정 — 재실행해도 같은 200개가 나온다.
const COUNT = 200;

// 가상의 저자·작품만 다룰 것이므로 여기 주제들은 실존 특정 저작물/인물을 가리키지 않는
// "분야" 수준으로만 적는다(예: "생물학" O, "다윈의 진화론" X).
const TOPICS = [
  "marine ecology",
  "astrophysics",
  "urban planning",
  "cognitive psychology",
  "economic policy",
  "linguistics",
  "art history",
  "architecture",
  "music theory",
  "film studies",
  "public health",
  "nutrition science",
  "computer science",
  "robotics",
  "materials science",
  "oceanography",
  "meteorology",
  "agriculture",
  "forestry conservation",
  "genetics",
  "neuroscience",
  "philosophy of mind",
  "applied ethics",
  "constitutional law",
  "education theory",
  "media studies",
  "folklore studies",
  "culinary history",
  "fashion history",
  "sports science",
  "transportation engineering",
  "energy policy",
  "geology",
  "chemistry",
  "sociology",
  "political science",
  "anthropology",
  "archaeology",
  "microbiology",
  "climate science",
] as const;

const GENRES = [
  "science explainer",
  "historical narrative",
  "personal memoir",
  "social criticism essay",
  "natural history observation",
  "policy analysis report",
  "anthropological field notes",
  "philosophical essay",
  "technology explainer",
  "literary criticism",
] as const;

const ERAS = [
  "ancient times",
  "the medieval period",
  "the early modern era",
  "the 19th century",
  "the early 20th century",
  "the mid-20th century",
  "the present day",
  "the near future (speculative)",
] as const;

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateRwTopics(count = COUNT, seed = SEED): RwTopic[] {
  const rand = mulberry32(seed);
  const combos: { topic: string; genre: string; era: string }[] = [];
  for (const topic of TOPICS) {
    for (const genre of GENRES) {
      for (const era of ERAS) {
        combos.push({ topic, genre, era });
      }
    }
  }
  const shuffled = shuffle(combos, rand);
  if (count > shuffled.length) {
    throw new Error(`요청한 개수(${count})가 가능한 조합 수(${shuffled.length})보다 많음`);
  }
  return shuffled.slice(0, count).map((c, i) => ({
    id: `RW-${String(i + 1).padStart(3, "0")}`,
    ...c,
    seedPrompt: `Write about a topic in ${c.topic}, in the style of a ${c.genre}, set in/reflecting ${c.era}. Invent a fictional author and fictional publication — do not reference any real person, book, or study.`,
  }));
}

function main() {
  const topics = generateRwTopics();
  const ids = new Set(topics.map((t) => t.id));
  if (ids.size !== topics.length) throw new Error("중복 ID 발견 — 생성기 버그");

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "rw-topics.json");
  writeFileSync(outPath, JSON.stringify(topics, null, 2) + "\n", "utf8");
  console.log(`${topics.length}개 소재 생성 → ${outPath}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
