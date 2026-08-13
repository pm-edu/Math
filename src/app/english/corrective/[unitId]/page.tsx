"use client";

import { use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import SessionPlayer from "@/components/english/SessionPlayer";
import { buildCorrectiveQueue, advanceCycle, MAX_CORRECTIVE_CYCLES, type ItemType } from "@/lib/engine";
import {
  loadUserStates,
  loadWordContents,
  loadConfusionPartners,
  loadUnitProgress,
  saveUnitProgress,
} from "@/lib/english/session-data";
import type { QueueItem } from "@/lib/english/types";

// 교정학습에서 실제로 쓸 수 있는 문항 유형(구현된 것만). CONTRAST는 혼동쌍이
// 있는 단어에만 별도로 나오므로 회전 목록엔 넣지 않는다.
const ROTATION: ItemType[] = ["EN_KO_MC", "KO_EN_TYPE", "CLOZE"];

export default function CorrectivePage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [forcedItemTypeByWord, setForcedItemTypeByWord] = useState<Record<string, ItemType>>({});
  const [priorCycleCount, setPriorCycleCount] = useState(0);
  const [priorMasteryRatio, setPriorMasteryRatio] = useState(0);
  const [priorTestScore, setPriorTestScore] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const wordIds = (searchParams.get("words") ?? "").split(",").filter(Boolean);
      if (wordIds.length === 0) { setLoading(false); return; }

      const [stateMap, contents, confusionMap, progress] = await Promise.all([
        loadUserStates(auth.user.id, wordIds),
        loadWordContents(wordIds),
        loadConfusionPartners(auth.user.id, wordIds),
        loadUnitProgress(auth.user.id, unitId),
      ]);

      const lastItemTypeByWord: Record<string, ItemType> = {};
      wordIds.forEach((id) => {
        const t = stateMap.get(id)?.lastItemType;
        if (t) lastItemTypeByWord[id] = t as ItemType;
      });
      const assignments = buildCorrectiveQueue({ wrongWordIds: wordIds, lastItemTypeByWord, rotation: ROTATION });
      setForcedItemTypeByWord(Object.fromEntries(assignments.map((a) => [a.wordId, a.itemType])));

      const contentById = new Map(contents.map((c) => [c.id, c]));
      const items: QueueItem[] = wordIds
        .map((id) => contentById.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((content) => ({
          content,
          progress: stateMap.get(content.id) ?? null,
          confusionPartner: confusionMap.get(content.id) ?? null,
        }));
      setQueue(items);

      setPriorCycleCount(progress?.cycleCount ?? 0);
      setPriorMasteryRatio(progress?.masteryRatio ?? 0);
      setPriorTestScore(progress?.testScore ?? 0);
      setExhausted((progress?.cycleCount ?? 0) >= MAX_CORRECTIVE_CYCLES);
      setLoading(false);
    }
    load();
  }, [unitId, searchParams, router]);

  async function handleFinished() {
    if (!userId) return;
    const { cycleCount } = advanceCycle(priorCycleCount);
    await saveUnitProgress(userId, unitId, {
      masteryRatio: priorMasteryRatio,
      testScore: priorTestScore,
      status: "in_progress",
      cycleCount,
    });
  }

  if (loading || !userId) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-sm text-[var(--secondary)]">불러오는 중...</p></main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      {exhausted && (
        <div className="mx-auto max-w-2xl px-6 pt-8">
          <p className="rounded-xl border border-[var(--border-c)] bg-[var(--pink-light)]/40 px-4 py-3 text-sm text-[var(--foreground)]">
            이 유닛을 여러 번 다시 학습했어요. 계속 어렵다면 선생님께 도움을 요청해보세요.
          </p>
        </div>
      )}
      <SessionPlayer
        mode="corrective"
        unitId={unitId}
        userId={userId}
        initialQueue={queue}
        forcedItemTypeByWord={forcedItemTypeByWord}
        onFinished={handleFinished}
        backHref="/english"
        backLabel="← 영어 학습으로"
        extraFinishedAction={{ href: `/english/test/${unitId}`, label: "다시 평가하기" }}
      />
      <Footer />
    </>
  );
}
