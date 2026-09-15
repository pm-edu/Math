"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import TrackInterestButton from "@/components/study/TrackInterestButton";
import type { TrackKey } from "@/lib/home/trackAvailability";

export interface UnitTopic {
  unitName: string;
  hasSample: boolean;
}

export default function DetailPageBody({
  trackKey,
  detail,
  detailLabel,
  topics,
}: {
  trackKey: TrackKey;
  detail: string;
  detailLabel: string;
  topics: UnitTopic[];
}) {
  const { t } = useLang();
  const router = useRouter();
  const [loadingUnit, setLoadingUnit] = useState<string | null>(null);
  const [errorUnit, setErrorUnit] = useState<string | null>(null);

  async function openSamplePdf(unitName: string) {
    setErrorUnit(null);
    setLoadingUnit(unitName);
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push(`/login?next=${encodeURIComponent(`/study/track/${trackKey}/${detail}`)}`);
      return;
    }

    try {
      const res = await fetch(
        `/api/study/sample-pdf?curriculumDetail=${encodeURIComponent(detail)}&unit=${encodeURIComponent(unitName)}`,
        { headers: { Authorization: `Bearer ${data.session.access_token}` } }
      );
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch {
      setErrorUnit(unitName);
    } finally {
      setLoadingUnit(null);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{detailLabel}</h1>
        <div className="mt-6">
          <TrackInterestButton trackKey={trackKey} curriculumDetail={detail} courseLabel={detailLabel} />
        </div>
      </section>

      <section className="mt-6">
        <p className="px-1 text-xs font-medium text-[var(--secondary)]">{t("track_topicsTitle")}</p>
        <ul className="mt-3 flex flex-col gap-3">
          {topics.map((topic) => (
            <li
              key={topic.unitName}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4"
            >
              <span className="text-sm font-medium text-[var(--foreground)]">{topic.unitName}</span>
              {topic.hasSample ? (
                <div className="flex items-center gap-3">
                  {errorUnit === topic.unitName && <span className="text-xs text-red-600">{t("track_pdfFailed")}</span>}
                  <button
                    type="button"
                    onClick={() => openSamplePdf(topic.unitName)}
                    disabled={loadingUnit === topic.unitName}
                    className="rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-50"
                  >
                    {loadingUnit === topic.unitName ? t("track_pdfLoading") : t("track_pdfView")}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[var(--secondary)]">{t("track_noSample")}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
