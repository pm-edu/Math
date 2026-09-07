"use client";

// 수학 학습 진행 구조 PG4: 온보딩 · 진단 (RUN_MATH_PROGRESSION.md PG4 4-1).
// 1) 커리큘럼 선택 → 2) 진단(적응형, 건너뛰기 가능) → 3) 결과로 시작 unit 확정+상위 unit
// 면제(math_placements) → 4) 첫 세션으로 바로 진입. 요금제·설정 화면을 중간에 끼우지 않는다.
//
// D-PG-1(1차 커리큘럼=IGCSE 0607)이 확정값이고 지금 실제로 문항·선수관계가 갖춰진 커리큘럼도
// 이것뿐이라, "커리큘럼 선택"은 지금은 IGCSE_0607 하나만 보여준다(src/lib/math/server/
// diagnostic.ts 상단 주석과 같은 이유).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { QuestionCard } from "@/components/math/QuestionCard";
import { useLang } from "@/lib/i18n";

const CURRICULUM_DETAIL = "IGCSE_0607";

interface DiagnosticItem {
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: "mcq" | "numeric" | "expression" | "free";
  choices: string[];
}

interface Placement {
  startUnitId: string | null;
  startUnitName: string | null;
  exemptedCount: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLang();

  const [step, setStep] = useState<"intro" | "diagnostic" | "finishing">("intro");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [item, setItem] = useState<DiagnosticItem | null>(null);
  const [position, setPosition] = useState(0);
  const [total, setTotal] = useState(0);
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; solution: string } | null>(null);
  const [pendingNext, setPendingNext] = useState<{ position: number; total: number; item: DiagnosticItem } | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<Placement | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setToken(data.session.access_token);
      });
  }, [router]);

  async function authFetch(path: string, init?: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message ?? "요청에 실패했습니다.");
    return data;
  }

  function goToUnit(unitId: string | null) {
    if (!unitId) {
      router.replace("/study");
      return;
    }
    router.push(`/study/${unitId}?kind=practice`);
  }

  async function handleStartDiagnostic() {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch("/api/math/diagnostic", {
        method: "POST",
        body: JSON.stringify({ curriculumDetail: CURRICULUM_DETAIL }),
      });
      setSessionId(data.sessionId);
      setItem(data.item);
      setPosition(data.position);
      setTotal(data.total);
      setStep("diagnostic");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch("/api/math/diagnostic/skip", {
        method: "POST",
        body: JSON.stringify({ curriculumDetail: CURRICULUM_DETAIL }),
      });
      goToUnit(data.startUnitId);
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (submittingRef.current || !sessionId || !item) return;
    const answer = item.answerFormat === "mcq" ? String(mcqChoice) : submitted.trim();
    if (!answer || answer === "null") return;

    submittingRef.current = true;
    setLoading(true);
    try {
      const data = await authFetch(`/api/math/diagnostic/${sessionId}/answer`, {
        method: "POST",
        body: JSON.stringify({ submitted: answer }),
      });
      setFeedback({ correct: data.correct, solution: data.solution });
      if (data.done) setPendingPlacement(data.placement);
      else setPendingNext(data.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  function handleNext() {
    if (pendingPlacement) {
      setStep("finishing");
      goToUnit(pendingPlacement.startUnitId);
      return;
    }
    if (!pendingNext) return;
    setItem(pendingNext.item);
    setPosition(pendingNext.position);
    setTotal(pendingNext.total);
    setPendingNext(null);
    setMcqChoice(null);
    setSubmitted("");
    setFeedback(null);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="mx-auto max-w-2xl px-6 py-16">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {step === "intro" && (
          <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
            <p className="text-xs font-medium text-[var(--secondary)]">{t("onboarding_curriculumLabel")}</p>
            <p className="mt-1 text-lg font-medium text-[var(--foreground)]">IGCSE 0607</p>

            <h1 className="mt-6 text-xl font-medium text-[var(--foreground)]">{t("onboarding_title")}</h1>
            <p className="mt-2 text-sm text-[var(--secondary)]">{t("onboarding_diagnosticIntro")}</p>

            <button
              type="button"
              onClick={handleStartDiagnostic}
              disabled={loading || !token}
              className="mt-6 w-full rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
            >
              {t("onboarding_startDiagnostic")}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading || !token}
              className="mt-3 w-full text-sm text-[var(--secondary)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              {t("onboarding_skip")}
            </button>
          </section>
        )}

        {step === "diagnostic" && item && (
          <section>
            <p className="mb-4 text-sm font-medium text-[var(--foreground)]">
              {t("onboarding_diagnosticTitle")} · {position + 1} / {total}
            </p>
            <div className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
              <QuestionCard
                contentText={item.contentText}
                imageUrl={item.imageUrl}
                answerFormat={item.answerFormat}
                choices={item.choices}
                mcqChoice={mcqChoice}
                onMcqChoice={setMcqChoice}
                numericValue={submitted}
                onNumericChange={setSubmitted}
                feedback={feedback}
              />
              <div className="mt-6">
                {!feedback ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || (item.answerFormat === "mcq" ? mcqChoice === null : !submitted.trim())}
                    className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
                  >
                    {t("study_submit")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={loading}
                    className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
                  >
                    {pendingPlacement ? t("study_finish") : t("study_next")}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {step === "finishing" && <p className="text-sm text-[var(--secondary)]">{t("onboarding_finishing")}</p>}
      </main>
    </div>
  );
}
