"use client";

// 과정 개요 — "중등"(KR 기본, 유일하게 실제 콘텐츠가 있는 과정) 소개 + "시작하기"(수강신청).
// RUN_MATH_SITE.md 재설계(2026-09-17)로 없앤 "신청→승인" 흐름을 가볍게 되살린다(2026-09-23
// 지시) — 새 승인 테이블은 안 만든다. profiles.curriculum_group만 채우면 그게 곧
// "신청함, 배정 대기" 상태다(관리자 화면 /admin/study/students에 이미 그렇게 뜸).
// 이 페이지는 DB 조회 없는 정적 소개(math_tracks.description은 비어있어 안 씀,
// src/components/home/data.ts의 "중등" 카드 문구를 확장) — 비로그인도 볼 수 있고,
// "시작하기"만 로그인 필요.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

export default function KrMiddleTrackPage() {
  const router = useRouter();
  const { t } = useLang();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setLoggedIn(!!data.user));
  }, []);

  async function handleStart() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/login");
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ curriculum_group: "KR" })
      .eq("id", auth.user.id);
    if (updateError) {
      setLoading(false);
      setError(t("trackOverview_startError"));
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/study/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programs: ["math"] }),
      }).catch(() => {});
    }

    router.push("/study");
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-[var(--background)] px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-bold text-[var(--foreground)]">
            {t("trackOverview_badge")}
          </span>
          <h1 className="mt-3 text-2xl font-bold text-[var(--foreground)]">{t("trackOverview_title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--secondary)]">{t("trackOverview_body")}</p>

          <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
            <p className="text-sm font-medium text-[var(--foreground)]">{t("trackOverview_whatYouGetTitle")}</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--secondary)]">
              <li>{t("trackOverview_point1")}</li>
              <li>{t("trackOverview_point2")}</li>
              <li>{t("trackOverview_point3")}</li>
            </ul>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {loggedIn === false ? (
            <a
              href="/login"
              className="mt-8 inline-block rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
            >
              {t("trackOverview_startButton")}
            </a>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={loading || loggedIn === null}
              className="mt-8 rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
            >
              {loading ? t("trackOverview_starting") : t("trackOverview_startButton")}
            </button>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
