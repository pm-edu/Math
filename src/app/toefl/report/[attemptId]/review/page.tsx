"use client";

// 문항별 리뷰 화면. docs/toefl-spec.md §14("오디오 스크립트는 제출 후 제공") — 스크립트·정답·
// 해설이 여기서 처음 노출된다. 데이터는 전부 GET /api/toefl/attempts/[id]/review(서버가 서명URL
// 발급까지 끝낸 값)에서 그대로 받아 렌더링만 한다.
// 언어 토글 적용 대상(2026-08-18) — 안내 화면.

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import ReviewItemCard from "@/components/toefl/review/ReviewItemCard";
import { SECTION_LABEL_KEY, SECTION_ORDER } from "@/lib/toefl/section-order";
import { useLang } from "@/lib/i18n";
import type { ReviewItem } from "@/components/toefl/review/types";

export default function ToeflReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login?toefl=1");
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/review`, {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.message ?? t("toefl_failedLoadReview"));
        setLoading(false);
        return;
      }
      setItems(data.items);
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, router]);

  if (loading) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex items-center justify-center py-24">
          <p className="text-sm text-[var(--secondary)]">{t("loading")}</p>
        </main>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <p className="text-sm text-red-600">⚠ {errorMsg}</p>
          <button onClick={() => router.push(`/toefl/report/${attemptId}`)} className="text-sm text-[var(--secondary)] underline">
            {t("toefl_backToReport")}
          </button>
        </main>
      </div>
    );
  }

  const sections = SECTION_ORDER.filter((s) => items.some((i) => i.section === s));

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("toefl_questionReview")}</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">{t("toefl_reviewSubtitle")}</p>

        {sections.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s}
                href={`#section-${s}`}
                className="rounded-full border border-[var(--border-c)] bg-white px-3 py-1 text-xs font-medium text-[var(--foreground)]"
              >
                {t(SECTION_LABEL_KEY[s])}
              </a>
            ))}
          </div>
        )}

        {sections.map((section) => {
          const sectionItems = items.filter((i) => i.section === section);
          return (
            <div key={section} id={`section-${section}`} className="mt-10 scroll-mt-20">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t(SECTION_LABEL_KEY[section])}</h2>
              <div className="mt-3 space-y-4">
                {sectionItems.map((item, idx) => (
                  <ReviewItemCard key={item.id} item={item} index={idx} />
                ))}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => router.push(`/toefl/report/${attemptId}`)}
          className="mt-10 text-sm text-[var(--secondary)] underline"
        >
          {t("toefl_backToReport")}
        </button>
      </main>
    </div>
  );
}
