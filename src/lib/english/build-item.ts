// 문항 하나를 실제로 만드는 로직. SessionPlayer(학습/복습/교정)와 TestPlayer(유닛
// 종합평가)가 공유해서 쓴다. entry+pool만으로 결과가 정해지는 순수 함수라 훅이 아니다.

import {
  initialMasteryState,
  pickItemTypeForLevel,
  generateEnKoMc,
  generateKoEnTyping,
  generateCloze,
  generateContrast,
  type MasteryState,
  type FsrsState,
  type ItemType,
  type EnKoMcItem,
  type KoEnTypingItem,
  type ClozeItem,
  type ContrastItem,
} from "@/lib/engine";
import type { QueueItem, WordProgress } from "./types";

export type CurrentItem =
  | { itemType: "EN_KO_MC"; item: EnKoMcItem; pool: Array<{ id: string; meaning: string }> }
  | { itemType: "KO_EN_TYPE"; item: KoEnTypingItem }
  | { itemType: "CLOZE"; item: ClozeItem }
  | { itemType: "CONTRAST"; item: ContrastItem; confusionPartnerWordId: string };

export type RunningEntry = QueueItem & {
  mastery: MasteryState;
  fsrs: FsrsState | null;
};

export function toMasteryState(progress: QueueItem["progress"]): MasteryState {
  if (!progress) return initialMasteryState();
  return {
    level: progress.level as MasteryState["level"],
    consecutiveWrong: progress.consecutiveWrong,
    consecutiveCorrect: progress.consecutiveCorrect,
    lastSessionId: progress.lastSessionId,
  };
}

export function toFsrsState(progress: QueueItem["progress"]): FsrsState | null {
  if (!progress || progress.stability === null || progress.difficulty === null) return null;
  return { stability: progress.stability, difficulty: progress.difficulty, dueAt: new Date().toISOString() };
}

// toMasteryState/toFsrsState의 역변환. 세션 도중 갱신된 RunningEntry를
// (DB를 다시 조회하지 않고) 그대로 다음 화면(예: 미니 점검)에 넘길 때 쓴다.
export function toWordProgress(entry: RunningEntry): WordProgress {
  return {
    level: entry.mastery.level,
    stability: entry.fsrs?.stability ?? null,
    difficulty: entry.fsrs?.difficulty ?? null,
    consecutiveWrong: entry.mastery.consecutiveWrong,
    consecutiveCorrect: entry.mastery.consecutiveCorrect,
    lastSessionId: entry.mastery.lastSessionId,
    lastItemType: null, // 교정학습 전용 필드라 세션 내 핸드오프에선 안 씀
  };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// forcedItemType을 주면(유닛 종합평가에서 같은 단어를 서로 다른 유형으로 두 번 내고
// 싶을 때) 레벨 기반 선택 대신 그 유형으로 만든다. 콘텐츠가 부족하면(예문 없음 등)
// 안전하게 대체 유형으로 내려간다.
export function buildItem(entry: RunningEntry, pool: RunningEntry[], forcedItemType?: ItemType): CurrentItem {
  const primarySense = entry.content.senses[0];
  const primaryExample = entry.content.examples[0];
  const hasUsableConfusion = !!entry.confusionPartner && !!primaryExample;

  const itemType: ItemType =
    forcedItemType ??
    pickItemTypeForLevel(entry.mastery.level, { hasConfusionPartner: hasUsableConfusion, rng: Math.random });

  if (itemType === "CONTRAST" && entry.confusionPartner && primaryExample) {
    const item = generateContrast({
      target: { lemma: entry.content.lemma, exampleEn: primaryExample.textEn },
      confusedWith: { lemma: entry.confusionPartner.lemma },
    });
    // 정답(target)이 항상 첫 보기로 나오지 않도록 화면에 보여줄 순서를 섞는다.
    return {
      itemType: "CONTRAST",
      item: { ...item, options: shuffle(item.options) },
      confusionPartnerWordId: entry.confusionPartner.wordId,
    };
  }

  if (itemType === "CLOZE" && primaryExample) {
    const item = generateCloze({ lemma: entry.content.lemma, exampleEn: primaryExample.textEn });
    return { itemType: "CLOZE", item };
  }

  if (itemType === "KO_EN_TYPE" || itemType === "CLOZE" /* 예문 없어서 CLOZE 대체 */) {
    const item = generateKoEnTyping({ lemma: entry.content.lemma, meaning: primarySense?.meaningKo ?? "" });
    return { itemType: "KO_EN_TYPE", item };
  }

  // EN_KO_MC (기본값 — 대조/빈칸 조건을 못 채웠을 때도 여기로 온다)
  const candidatePool = pool
    .filter((p) => p.content.id !== entry.content.id && p.content.senses[0])
    .map((p) => ({ id: p.content.id, meaning: p.content.senses[0].meaningKo }));
  const item = generateEnKoMc(
    { lemma: entry.content.lemma, meaning: primarySense?.meaningKo ?? "" },
    candidatePool.map((c) => ({
      item: c,
      key: c.meaning,
      isConfusion: c.id === entry.confusionPartner?.wordId,
    }))
  );
  // 정답이 항상 첫 보기로 나오지 않도록 화면에 보여줄 순서를 섞는다.
  return { itemType: "EN_KO_MC", item: { ...item, options: shuffle(item.options) }, pool: candidatePool };
}
