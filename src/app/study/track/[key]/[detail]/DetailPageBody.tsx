"use client";

import { MathText } from "@/components/ProblemBody";
import { useLang } from "@/lib/i18n";
import TrackInterestButton from "@/components/study/TrackInterestButton";
import type { TrackKey } from "@/lib/home/trackAvailability";

export interface SampleProblem {
  id: string;
  contentText: string | null;
  imageUrl: string | null;
}

export interface UnitPreview {
  unitName: string;
  samples: SampleProblem[];
}

export default function DetailPageBody({
  trackKey,
  detail,
  detailLabel,
  units,
}: {
  trackKey: TrackKey;
  detail: string;
  detailLabel: string;
  units: UnitPreview[];
}) {
  const { t } = useLang();

  return (
    <>
      <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{detailLabel}</h1>
        <div className="mt-6">
          <TrackInterestButton trackKey={trackKey} curriculumDetail={detail} courseLabel={detailLabel} />
        </div>
      </section>

      <section className="mt-6">
        <p className="px-1 text-xs font-medium text-[var(--secondary)]">{t("track_sampleTitle")}</p>
        <div className="mt-3 flex flex-col gap-4">
          {units.map((unit) => (
            <div key={unit.unitName} className="rounded-2xl border border-[var(--border-c)] bg-white p-6">
              <h2 className="text-sm font-medium text-[var(--foreground)]">{unit.unitName}</h2>
              {unit.samples.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--secondary)]">{t("track_noSample")}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-4">
                  {unit.samples.map((sample) => (
                    <div key={sample.id} className="rounded-xl bg-[var(--background)] p-4">
                      {sample.contentText && (
                        <MathText text={sample.contentText} className="text-sm text-[var(--foreground)]" />
                      )}
                      {sample.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sample.imageUrl} alt="" className="mt-2 max-w-full rounded-lg" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
