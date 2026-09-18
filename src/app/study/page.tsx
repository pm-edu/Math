"use client";

// RUN_MATH_SITE.md 5-1: 대시보드. v_math_next_action 한 행만 읽어서 큰 카드 하나로 렌더한다
// (3단계 전 임시 안내문구를 실제 뷰 기반 카드로 교체, 추가 B). 조건 분기는 뷰(SQL) 쪽에서
// 이미 끝났으니, 이 페이지는 결과를 보여주기만 한다 — PG2 원래 설계와 같은 원칙.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

interface NextAction {
  action_type: "assignment" | "track" | "done";
  worksheet_id: string | null;
  worksheet_title: string | null;
  reason_ko: string | null;
}

interface RecentResult {
  worksheet_id: string;
  worksheet_title: string;
  accuracy: number;
  last_attempt_at: string;
}

export default function StudyPage() {
  const router = useRouter();
  const { t } = useLang();

  const [loading, setLoading] = useState(true);
  const [hasTrack, setHasTrack] = useState(false);
  const [action, setAction] = useState<NextAction | null>(null);
  const [recent, setRecent] = useState<RecentResult[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      // 온보딩은 /onboarding/subjects 하나뿐이다(RUN_MATH_SITE.md 2.5단계 확정 — math_placements
      // 기반 옛 게이트는 동결). curriculum_group이 비어있으면(가입 시 필수라 신규 학생은 거의
      // 없음, 과거 가입자만 해당) 거기로 보낸다.
      const { data: profile } = await supabase
        .from("profiles")
        .select("curriculum_group, track_id")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!profile?.curriculum_group) {
        router.replace("/onboarding/subjects");
        return;
      }
      setHasTrack(!!profile.track_id);

      const [actionResult, recentResult] = await Promise.all([
        supabase.from("v_math_next_action").select("*").eq("user_id", auth.user.id).maybeSingle(),
        supabase
          .from("v_math_student_overview")
          .select("worksheet_id, worksheet_title, accuracy, last_attempt_at")
          .eq("user_id", auth.user.id)
          .order("last_attempt_at", { ascending: false })
          .limit(3),
      ]);

      setAction((actionResult.data as NextAction) ?? null);
      setRecent((recentResult.data as RecentResult[]) ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : (
          <div className="space-y-6">
            <TodayCard action={action} hasTrack={hasTrack} />

            <div>
              <h2 className="text-sm font-medium text-[var(--foreground)]">{t("study_recentResultsTitle")}</h2>
              {recent.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--secondary)]">{t("study_noRecentResults")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {recent.map((r) => (
                    <li
                      key={r.worksheet_id}
                      className="flex items-center justify-between rounded-xl border border-[var(--border-c)] bg-white px-4 py-3"
                    >
                      <span className="text-sm text-[var(--foreground)]">{r.worksheet_title}</span>
                      <span className="text-sm font-medium text-[var(--secondary)]">
                        {Math.round(r.accuracy * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function TodayCard({ action, hasTrack }: { action: NextAction | null; hasTrack: boolean }) {
  const { t } = useLang();

  if (!action || action.action_type === "done") {
    if (!hasTrack) {
      return (
        <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">{t("study_noticeTitle")}</p>
          <p className="mt-2 text-sm text-[var(--secondary)]">{t("study_noticeBody")}</p>
          <div className="mt-4 space-y-1 text-xs text-[var(--secondary)]">
            <p>WhatsApp: +91 99580 64728</p>
            <p>KakaoTalk ID: 2014pmedu</p>
          </div>
        </section>
      );
    }
    return (
      <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
        <p className="text-sm font-medium text-[var(--foreground)]">{t("study_allDoneTitle")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
      <p className="text-xs text-[var(--secondary)]">{action.reason_ko}</p>
      <p className="mt-1 text-lg font-medium text-[var(--foreground)]">{action.worksheet_title}</p>
      <Link
        href={`/study/w/${action.worksheet_id}`}
        className="mt-5 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
      >
        {t("study_solveButton")}
      </Link>
    </section>
  );
}
