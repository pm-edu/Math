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
  const [curriculumPreparing, setCurriculumPreparing] = useState(false);
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

      // curriculum_group이 비어있으면(가입 시 필수라 신규 학생은 거의 없음, 과거 가입자만
      // 해당) 채워야 한다. 규칙(2026-09-18 확정): 학생이 과정을 고르면(선택) → 관리자가
      // /admin/study/students에서 직접 배정 → 학생은 /mypage에서 배정 여부를 확인한 뒤
      // /study로 들어온다. 자동배정은 이 규칙에 안 맞아 되돌렸다(잠깐 self_onboard_kr_track()
      // 으로 즉시 자동배정했었으나 관리자 단계를 건너뛰어서 폐기 — 그 함수는 DB에서도 삭제).
      // 온보딩 화면은 호스트별로 다르다 — 루트 도메인은 기존 /onboarding/subjects(4과목
      // 관심 표시), math.pmedu4u.com은 /study/onboarding(교육과정 중 하나를 골라
      // curriculum_group만 저장 — track 배정은 안 함, 그건 관리자 몫).
      const { data: profile } = await supabase
        .from("profiles")
        .select("curriculum_group, track_id")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (!profile?.curriculum_group) {
        const isMathHost = window.location.hostname.startsWith("math.");
        router.replace(isMathHost ? "/study/onboarding" : "/onboarding/subjects");
        return;
      }
      setHasTrack(!!profile.track_id);

      // 과정(track)이 배정 안 된 이유가 "관리자가 아직 안 정했다"인지 "이 커리큘럼엔 아직
      // 과정 자체가 없다"(IB/CBSE/AS·A Level처럼 8문항 이상인 단원이 없어 seed-tracks.ts가
      // 못 만든 경우)인지 구분해서 다른 안내를 보여준다.
      let preparing = false;
      if (!profile.track_id) {
        const { data: tracks } = await supabase
          .from("math_tracks")
          .select("id")
          .eq("curriculum_group", profile.curriculum_group)
          .eq("is_active", true)
          .limit(1);
        preparing = (tracks?.length ?? 0) === 0;
      }
      setCurriculumPreparing(preparing);

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
            <TodayCard action={action} hasTrack={hasTrack} curriculumPreparing={curriculumPreparing} />

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

function TodayCard({
  action,
  hasTrack,
  curriculumPreparing,
}: {
  action: NextAction | null;
  hasTrack: boolean;
  curriculumPreparing: boolean;
}) {
  const { t } = useLang();

  if (!action || action.action_type === "done") {
    if (!hasTrack) {
      return (
        <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {t(curriculumPreparing ? "study_curriculumPreparingTitle" : "study_noticeTitle")}
          </p>
          <p className="mt-2 text-sm text-[var(--secondary)]">{t("study_noticeBody")}</p>
          <Link
            href="/mypage"
            className="mt-4 inline-block rounded-full border border-[var(--border-c)] px-5 py-2 text-sm font-medium text-[var(--foreground)]"
          >
            {t("study_goToMyPage")}
          </Link>
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
