"use client";

// RUN_MATH_SITE.md 5-1(신설) → 2026-09-23 재설계: "문제지 카드 1개만" 보여주던 화면이
// 마이페이지처럼 보이고, 아무 개요 없이 바로 문제풀이로 들어가는 게 이상하다는 지적
// (사용자, 2026-09-23) — 과정 헤더 + 전체 문제지 리스트(완료/열림/잠김)로 바꾼다.
// 새 흐름: 메인페이지 "중등" → /study/track/kr-middle(과정 개요) → "시작하기"(=수강신청,
// curriculum_group만 저장) → 여기(/study)에서 전체 리스트를 바로 보여줌(배정 전이면
// 전부 잠김) → 관리자가 배정하면 첫 문제지만 열림.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

type ProgressStatus = "locked" | "open" | "passed";

interface WorksheetRow {
  position: number;
  worksheetId: string;
  title: string;
  status: ProgressStatus;
}

interface AssignedRow {
  worksheetId: string;
  title: string;
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
  const [curriculumPreparing, setCurriculumPreparing] = useState(false);
  const [trackName, setTrackName] = useState<string | null>(null);
  const [worksheets, setWorksheets] = useState<WorksheetRow[]>([]);
  const [assigned, setAssigned] = useState<AssignedRow[]>([]);
  const [recent, setRecent] = useState<RecentResult[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const userId = auth.user.id;

      // curriculum_group이 비어있으면(가입 시 필수라 신규 학생은 거의 없음, 과거 가입자만
      // 해당) 채워야 한다. 규칙(2026-09-18 확정): 학생이 과정을 고르면(선택) → 관리자가
      // /admin/study/students에서 직접 배정 → 학생은 /mypage에서 배정 여부를 확인한 뒤
      // /study로 들어온다. 온보딩 화면은 호스트별로 다르다 — 루트 도메인은 기존
      // /onboarding/subjects(4과목 관심 표시), math.pmedu4u.com은 /study/onboarding.
      const { data: profile } = await supabase
        .from("profiles")
        .select("curriculum_group, track_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.curriculum_group) {
        const isMathHost = window.location.hostname.startsWith("math.");
        router.replace(isMathHost ? "/study/onboarding" : "/onboarding/subjects");
        return;
      }

      // 배정 여부와 무관하게 리스트를 보여준다 — 배정됐으면 profiles.track_id를, 아직
      // 배정 전이면(curriculum_group만 있음, "신청함" 상태) 그 커리큘럼의 기본 과정을 찾아
      // 미리보기로 쓴다(전부 잠김으로 보임). 둘 다 없으면 이 커리큘럼엔 과정 자체가 아직
      // 없는 것(IB/CBSE/AS·A Level 등) — "준비 중" 안내.
      let trackId = profile.track_id as string | null;
      let name: string | null = null;
      if (trackId) {
        const { data: track } = await supabase.from("math_tracks").select("name").eq("id", trackId).maybeSingle();
        name = track?.name ?? null;
      } else {
        const { data: defaultTrack } = await supabase
          .from("math_tracks")
          .select("id, name")
          .eq("curriculum_group", profile.curriculum_group)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (defaultTrack) {
          trackId = defaultTrack.id;
          name = defaultTrack.name;
        }
      }

      if (!trackId) {
        setCurriculumPreparing(true);
        setLoading(false);
        return;
      }
      setTrackName(name);

      const [trackWorksheetsResult, progressResult, assignmentsResult, recentResult] = await Promise.all([
        supabase
          .from("math_track_worksheets")
          .select("position, worksheet_id, worksheets(title)")
          .eq("track_id", trackId)
          .order("position"),
        supabase.from("math_track_progress").select("worksheet_id, status").eq("user_id", userId),
        supabase.from("v_math_student_assignments").select("worksheet_id").eq("user_id", userId),
        supabase
          .from("v_math_student_overview")
          .select("worksheet_id, worksheet_title, accuracy, last_attempt_at")
          .eq("user_id", userId)
          .order("last_attempt_at", { ascending: false })
          .limit(3),
      ]);

      const progressMap = new Map(
        (progressResult.data ?? []).map((p) => [p.worksheet_id, p.status as ProgressStatus])
      );
      type JoinedTrackWorksheet = { position: number; worksheet_id: string; worksheets: { title: string } | null };
      const list: WorksheetRow[] = ((trackWorksheetsResult.data ?? []) as unknown as JoinedTrackWorksheet[]).map((w) => ({
        position: w.position,
        worksheetId: w.worksheet_id,
        title: w.worksheets?.title ?? "",
        status: progressMap.get(w.worksheet_id) ?? "locked",
      }));
      setWorksheets(list);

      const trackWorksheetIds = new Set(list.map((w) => w.worksheetId));
      const assignedIds = (assignmentsResult.data ?? [])
        .map((a) => a.worksheet_id)
        .filter((id) => !trackWorksheetIds.has(id));
      if (assignedIds.length > 0) {
        const { data: assignedWorksheets } = await supabase.from("worksheets").select("id, title").in("id", assignedIds);
        setAssigned((assignedWorksheets ?? []).map((w) => ({ worksheetId: w.id, title: w.title })));
      } else {
        setAssigned([]);
      }

      setRecent((recentResult.data as RecentResult[]) ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  const passedCount = worksheets.filter((w) => w.status === "passed").length;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : curriculumPreparing ? (
          <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">{t("study_curriculumPreparingTitle")}</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">{t("study_noticeBody")}</p>
            <Link
              href="/mypage"
              className="mt-4 inline-block rounded-full border border-[var(--border-c)] px-5 py-2 text-sm font-medium text-[var(--foreground)]"
            >
              {t("study_goToMyPage")}
            </Link>
          </section>
        ) : (
          <div className="space-y-8">
            <section>
              <h1 className="text-lg font-bold text-[var(--foreground)]">{trackName}</h1>
              <p className="mt-1 text-sm text-[var(--secondary)]">
                {t("study_progressLabel").replace("{done}", String(passedCount)).replace("{total}", String(worksheets.length))}
              </p>
            </section>

            {assigned.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-[var(--foreground)]">{t("study_assignedSectionTitle")}</h2>
                <ul className="mt-3 space-y-2">
                  {assigned.map((a) => (
                    <li key={a.worksheetId}>
                      <Link
                        href={`/study/w/${a.worksheetId}`}
                        className="flex items-center justify-between rounded-xl border border-[var(--pink)] bg-white px-4 py-3 hover:bg-[var(--mint)]/30"
                      >
                        <span className="text-sm text-[var(--foreground)]">{a.title}</span>
                        <span className="text-xs font-medium text-[var(--pink-dark)]">{t("study_solveButton")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h2 className="text-sm font-medium text-[var(--foreground)]">{t("study_worksheetListTitle")}</h2>
              <ul className="mt-3 space-y-2">
                {worksheets.map((w) => {
                  const clickable = w.status === "open" || w.status === "passed";
                  const statusLabel =
                    w.status === "passed"
                      ? t("study_statusPassed")
                      : w.status === "open"
                        ? t("study_statusOpen")
                        : t("study_statusLocked");
                  const content = (
                    <>
                      <span className="flex items-center gap-3">
                        <span className="w-6 text-xs text-[var(--secondary)]">{w.position}</span>
                        <span className={`text-sm ${clickable ? "text-[var(--foreground)]" : "text-[var(--secondary)]"}`}>
                          {w.title}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          w.status === "passed"
                            ? "bg-[var(--mint)] text-[var(--foreground)]"
                            : w.status === "open"
                              ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                              : "bg-[var(--border-c)] text-[var(--secondary)]"
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </>
                  );
                  return (
                    <li key={w.worksheetId}>
                      {clickable ? (
                        <Link
                          href={`/study/w/${w.worksheetId}`}
                          className="flex items-center justify-between rounded-xl border border-[var(--border-c)] bg-white px-4 py-3 hover:bg-[var(--mint)]/20"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div className="flex items-center justify-between rounded-xl border border-[var(--border-c)] bg-white/60 px-4 py-3 opacity-70">
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
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
            </section>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
