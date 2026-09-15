"use client";

import Link from "next/link";
import { useLang } from "@/lib/i18n";
import TrackInterestButton from "@/components/study/TrackInterestButton";
import type { Program } from "@/components/home/data";
import type { TrackAvailability, TrackKey } from "@/lib/home/trackAvailability";

// 트랙 페이지 본문 — useLang(클라이언트 컨텍스트)을 써야 해서 서버 컴포넌트인 page.tsx에서
// 분리했다. 데이터(availability)는 page.tsx가 서버에서 이미 조회해 props로 내려준다.
export default function TrackPageBody({
  trackKey,
  program,
  availability,
}: {
  trackKey: TrackKey;
  program: Program;
  availability: TrackAvailability;
}) {
  const { t } = useLang();

  return (
    <>
      <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">{program.label}</h1>
          <span
            className={`inline-flex items-center h-[22px] px-[9px] rounded-[6px] text-xs font-bold ${
              availability.status === "live"
                ? "bg-[var(--mint)]/40 text-[var(--mint-dark)]"
                : "bg-[var(--border-c)]/60 text-[var(--secondary)]"
            }`}
          >
            {availability.status === "live" ? t("track_statusLive") : t("track_statusSoon")}
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--secondary)]">{program.description}</p>

        <div className="mt-6">
          <TrackInterestButton trackKey={trackKey} courseLabel={program.label} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-8">
        <p className="text-xs font-medium text-[var(--secondary)]">{t("track_detailsTitle")}</p>
        <ul className="mt-4 flex flex-col gap-3">
          {availability.details.map((detail) => (
            <li
              key={detail.value}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-c)] px-4 py-3"
            >
              <span className="text-sm font-medium text-[var(--foreground)]">{detail.label}</span>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center h-[22px] px-[9px] rounded-[6px] text-xs font-bold ${
                    detail.status === "live"
                      ? "bg-[var(--mint)]/40 text-[var(--mint-dark)]"
                      : "bg-[var(--border-c)]/60 text-[var(--secondary)]"
                  }`}
                >
                  {detail.status === "live" ? t("track_statusLive") : t("track_statusSoon")}
                </span>
                {detail.status === "live" && (
                  <Link
                    href={`/study/onboarding?curriculum=${encodeURIComponent(detail.value)}`}
                    className="text-sm font-medium text-[var(--pink-dark)] hover:underline"
                  >
                    {t("track_startCourse")}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
