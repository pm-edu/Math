"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import TestPlayer from "@/components/english/TestPlayer";
import {
  loadUnitWordIds,
  loadUserStates,
  loadWordContents,
  loadConfusionPartners,
} from "@/lib/english/session-data";
import type { QueueItem } from "@/lib/english/types";

export default function UnitTestPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const wordIds = await loadUnitWordIds(unitId);
      const stateMap = await loadUserStates(auth.user.id, wordIds);

      // 아직 한 번도 안 배운 단어가 있으면 평가 대신 학습을 먼저 하도록 안내한다.
      if (wordIds.some((id) => !stateMap.has(id))) {
        setNotReady(true);
        setLoading(false);
        return;
      }

      const [contents, confusionMap] = await Promise.all([
        loadWordContents(wordIds),
        loadConfusionPartners(auth.user.id, wordIds),
      ]);
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
      setLoading(false);
    }
    load();
  }, [unitId, router]);

  if (loading || !userId) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-sm text-[var(--secondary)]">불러오는 중...</p></main>
        <Footer />
      </>
    );
  }

  if (notReady) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">아직 준비가 안 됐어요</h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">이 유닛의 단어를 먼저 한 번씩 배운 뒤 종합평가를 볼 수 있어요.</p>
          <Link href={`/english/learn/${unitId}`} className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
            새 단어 배우러 가기
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <TestPlayer unitId={unitId} userId={userId} words={queue} />
      <Footer />
    </>
  );
}
