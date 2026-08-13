"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import SessionPlayer from "@/components/english/SessionPlayer";
import {
  loadUnitTitle,
  loadUnitWordIds,
  loadUserStates,
  loadWordContents,
  loadConfusionPartners,
} from "@/lib/english/session-data";
import type { QueueItem } from "@/lib/english/types";

const NEW_WORDS_PER_SESSION = 8;

export default function LearnUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const unit = await loadUnitTitle(unitId);
      setTitle(unit ? `${unit.setTitleKo} · ${unit.title}` : "단어장");

      const wordIds = await loadUnitWordIds(unitId);
      const stateMap = await loadUserStates(auth.user.id, wordIds);
      const newWordIds = wordIds.filter((id) => !stateMap.has(id)).slice(0, NEW_WORDS_PER_SESSION);

      const [contents, confusionMap] = await Promise.all([
        loadWordContents(newWordIds),
        loadConfusionPartners(auth.user.id, newWordIds),
      ]);

      const contentById = new Map(contents.map((c) => [c.id, c]));
      const items: QueueItem[] = newWordIds
        .map((id) => contentById.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((content) => ({
          content,
          progress: null,
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

  return (
    <>
      <Header />
      <SessionPlayer
        mode="learn"
        unitId={unitId}
        userId={userId}
        initialQueue={queue}
        backHref="/english"
        backLabel={`← ${title || "영어 학습"}`}
      />
      <Footer />
    </>
  );
}
