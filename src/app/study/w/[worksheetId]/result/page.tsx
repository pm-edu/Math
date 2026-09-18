"use client";

// RUN_MATH_SITE.md 5-1: 문제지 결과 화면. finishWorksheet 응답을 그대로 sessionStorage에서
// 읽는다(솔브 화면이 이미 한 번 호출해 저장해둠) — 여기서 다시 부르면 math_track_progress.attempts가
// 중복으로 올라간다.

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useLang } from "@/lib/i18n";

interface FinishResult {
  worksheetTitle: string;
  accuracy: number;
  passed: boolean;
  unlockedNextWorksheetId: string | null;
}

export default function WorksheetResultPage() {
  const params = useParams<{ worksheetId: string }>();
  const router = useRouter();
  const { t } = useLang();
  const worksheetId = params.worksheetId;
  // 첫 렌더에서 한 번만 sessionStorage를 읽는다(효과 안에서 setState 하면 불필요한 리렌더가
  // 한 번 더 생김 — 이 값은 마운트 시점에 이미 고정돼 있어 지연 초기화로 충분하다).
  const [result] = useState<FinishResult | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(`math_worksheet_result_${worksheetId}`);
    return raw ? JSON.parse(raw) : null;
  });

  if (!result) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-sm text-[var(--secondary)]">{t("study_errorLoad")}</p>
          <Link href="/study" className="mt-6 inline-block text-sm text-[var(--pink-dark)] underline">
            {t("study_resultBackToDashboard")}
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-medium text-[var(--foreground)]">{result.worksheetTitle}</h1>
        <p className="mt-6 text-4xl font-medium text-[var(--foreground)]">{Math.round(result.accuracy * 100)}%</p>
        <p className="mt-1 text-sm text-[var(--secondary)]">{t("study_resultAccuracy")}</p>

        <p className={`mt-6 text-sm font-medium ${result.passed ? "text-[var(--mint-dark)]" : "text-red-600"}`}>
          {result.passed ? t("study_passedBanner") : t("study_notPassedBanner")}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {result.passed && result.unlockedNextWorksheetId ? (
            <button
              onClick={() => router.push(`/study/w/${result.unlockedNextWorksheetId}`)}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
            >
              {t("study_goNextWorksheet")}
            </button>
          ) : !result.passed ? (
            <button
              onClick={() => router.push(`/study/w/${worksheetId}?retry=1`)}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
            >
              {t("study_retryWrongButton")}
            </button>
          ) : null}
          <Link href="/study" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
            {t("study_resultBackToDashboard")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
