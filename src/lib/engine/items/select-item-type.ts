// 숙련도 사다리(mastery-level.ts)의 레벨과 실제로 낼 문항 유형(items/)을 잇는다.
// Lv0~1(인지)=EN_KO_MC, Lv2(회상)=KO_EN_TYPE, Lv3+(생산)=CLOZE.
// 혼동쌍 상대가 있으면(confusion-pairs.ts) 일정 확률로 CONTRAST를 섞어 낸다.

import type { ItemType, MasteryLevel } from "../types";

const CONTRAST_CHANCE = 0.3; // 혼동쌍이 있을 때 CONTRAST를 낼 확률(MVP 기본값)

export function pickItemTypeForLevel(
  level: MasteryLevel,
  opts?: { hasConfusionPartner?: boolean; rng?: () => number }
): ItemType {
  const rng = opts?.rng ?? Math.random;
  if (opts?.hasConfusionPartner && rng() < CONTRAST_CHANCE) {
    return "CONTRAST";
  }
  if (level <= 1) return "EN_KO_MC";
  if (level === 2) return "KO_EN_TYPE";
  return "CLOZE";
}
