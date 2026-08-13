"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import SessionPlayer from "@/components/english/SessionPlayer";
import { loadDueWordIds, loadUserStates, loadWordContents, loadConfusionPartners } from "@/lib/english/session-data";
import type { QueueItem } from "@/lib/english/types";

const REVIEW_SESSION_SIZE = 15;

export default function ReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const dueWordIds = await loadDueWordIds(auth.user.id, REVIEW_SESSION_SIZE);
      const [contents, stateMap, confusionMap] = await Promise.all([
        loadWordContents(dueWordIds),
        loadUserStates(auth.user.id, dueWordIds),
        loadConfusionPartners(auth.user.id, dueWordIds),
      ]);

      const contentById = new Map(contents.map((c) => [c.id, c]));
      const items: QueueItem[] = dueWordIds
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
  }, [router]);

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
      <SessionPlayer mode="review" unitId={null} userId={userId} initialQueue={queue} backHref="/english" backLabel="← 영어 학습으로" />
      <Footer />
    </>
  );
}
