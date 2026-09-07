"use client";

// 수학 학습 진행 구조 PG3: 세션 실행 화면 (RUN_MATH_PROGRESSION.md PG3 3-1/3-2).
// 전체화면, 헤더/네비 최소화(이탈 방지) — 사이트 전체 Header/Footer를 쓰지 않고 진행률만
// 보여주는 얇은 바 하나만 그린다(SatHeader/ToeflHeader와 같은 원칙).
//
// 새로고침 복구는 서버 상태(math_sessions.status='in_progress')에만 의존한다(3-2 요구사항) —
// GET /api/math/sessions?unitId= 가 항상 진행 중인 세션의 실제 상태를 돌려주고, 이 페이지는
// 그 결과로만 화면을 그린다. 클라이언트에 answer_spec/정답은 절대 내려오지 않는다(3-3 금지).

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MathText } from "@/components/ProblemBody";
import { useLang } from "@/lib/i18n";

interface SessionItem {
  position: number;
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: "mcq" | "numeric" | "expression" | "free";
  choices: string[];
  difficulty: string;
}

const LETTERS = ["A", "B", "C", "D"];

export default function StudySessionPage() {
  const router = useRouter();
  const params = useParams<{ unitId: string }>();
  const searchParams = useSearchParams();
  const { t } = useLang();
  const kind = searchParams.get("kind") ?? "practice";

  const [token, setToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState("");
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; solution: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Date.now()는 렌더 중에 부르면 안 되는 impure 호출이라 0으로 시작하고, 실제 값은
  // useEffect(문항이 바뀔 때/초기화 시)에서만 채운다.
  const questionStartedAt = useRef<number>(0);
  // React StrictMode(개발 모드)가 마운트 시 effect를 두 번 실행한다 — 가드 없이 두면 세션
  // 생성 POST가 동시에 두 번 나가서 math_sessions_one_active_idx(사용자당 진행세션 1개)
  // 유니크 제약에 걸려 실패하는 걸 실사용 중 발견했다. 같은 마운트 사이클에서 중복 실행만
  // 막는다(실제 재요청은 막지 않음 — cleanup에서 false로 안 돌려서 재마운트시엔 다시 돈다).
  const initStarted = useRef(false);
  const submittingRef = useRef(false);

  async function authFetch(path: string, init?: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message ?? "요청에 실패했습니다.");
    return data;
  }

  useEffect(() => {
    async function init() {
      if (initStarted.current) return;
      initStarted.current = true;

      const supabase = createClient();
      const { data: authSession } = await supabase.auth.getSession();
      const accessToken = authSession.session?.access_token;
      if (!accessToken) {
        router.replace("/login");
        return;
      }
      setToken(accessToken);

      try {
        const authHeader = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
        const activeRes = await fetch(`/api/math/sessions?unitId=${params.unitId}`, { headers: authHeader });
        const activeData = await activeRes.json();
        if (!activeRes.ok || !activeData.ok) throw new Error(activeData.message ?? "불러오지 못했습니다.");

        if (activeData.active) {
          const { sessionId: sid, items: activeItems, answeredCount } = activeData.active;
          setSessionId(sid);
          setItems(activeItems);
          if (answeredCount >= activeItems.length) {
            // 답은 다 했는데 완료 처리 전에 이탈한 경우 — 바로 완료 처리하고 결과로 보낸다.
            await fetch(`/api/math/sessions/${sid}/complete`, { method: "POST", headers: authHeader });
            router.replace(`/study/${params.unitId}/result?sessionId=${sid}`);
            return;
          }
          setPosition(answeredCount);
        } else {
          const createRes = await fetch("/api/math/sessions", {
            method: "POST",
            headers: authHeader,
            body: JSON.stringify({ unitId: params.unitId, kind }),
          });
          const createData = await createRes.json();
          if (!createRes.ok || !createData.ok) {
            // 이미 진행 중인 세션이 있어서 거부된 경우, 그 사이 다른 요청이 만든 세션일 수
            // 있으니 이 unit 기준으로 한 번 더 조회해 본다(레이스 자연 복구).
            const retryRes = await fetch(`/api/math/sessions?unitId=${params.unitId}`, { headers: authHeader });
            const retryData = await retryRes.json();
            if (retryRes.ok && retryData.ok && retryData.active) {
              setSessionId(retryData.active.sessionId);
              setItems(retryData.active.items);
              setPosition(retryData.active.answeredCount);
            } else {
              throw new Error(createData.message ?? "세션을 시작하지 못했습니다.");
            }
          } else {
            setSessionId(createData.sessionId);
            setItems(createData.items);
            setPosition(0);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        questionStartedAt.current = Date.now();
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.unitId]);

  const current = items[position];

  async function handleSubmit() {
    // setSubmitting(true)는 다음 렌더까지 반영이 안 돼서 아주 빠른 연속 클릭(더블클릭 등)이
    // disabled 적용 전에 두 번째 호출을 통과시킬 수 있다 — submitting.current 체크로 그 틈을
    // 막는다(서버 쪽도 session.ts submitAnswer에서 멱등 처리로 한 번 더 막아둠).
    if (submittingRef.current || !sessionId || !current) return;
    const answer = current.answerFormat === "mcq" ? String(mcqChoice) : submitted.trim();
    if (!answer || answer === "null") return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const elapsedSeconds = Math.round((Date.now() - questionStartedAt.current) / 1000);
      const result = await authFetch(`/api/math/sessions/${sessionId}/answer`, {
        method: "POST",
        body: JSON.stringify({ position, submitted: answer, elapsedSeconds }),
      });
      setFeedback({ correct: result.correct, solution: result.solution });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleNext() {
    if (submittingRef.current || !sessionId) return;
    if (position + 1 < items.length) {
      setPosition((p) => p + 1);
      setSubmitted("");
      setMcqChoice(null);
      setFeedback(null);
      questionStartedAt.current = Date.now();
      return;
    }
    // 마지막 문항 — 세션 완료 처리 후 결과 화면으로. 여기서 대시보드로 되돌리지 않는다(3-2).
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await authFetch(`/api/math/sessions/${sessionId}/complete`, { method: "POST" });
      router.push(`/study/${params.unitId}/result?sessionId=${sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="border-b border-[var(--border-c)] px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/study" className="text-sm text-[var(--secondary)] hover:text-[var(--foreground)]">
            {t("study_exit")}
          </Link>
          {!loading && items.length > 0 && (
            <p className="text-sm font-medium text-[var(--foreground)]">
              {position + 1} / {items.length}
            </p>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-6 py-12">
        {loading ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !current ? (
          <p className="text-sm text-[var(--secondary)]">{t("study_noItems")}</p>
        ) : (
          <section className="rounded-2xl border border-[var(--border-c)] bg-white p-8">
            <MathText text={current.contentText} className="text-base leading-relaxed text-[var(--foreground)]" />
            {current.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.imageUrl} alt="" className="mt-4 max-w-full rounded-lg" />
            )}

            <div className="mt-6">
              {current.answerFormat === "mcq" ? (
                <div className="flex flex-col gap-3">
                  {current.choices.map((choice, i) => {
                    const isSelected = mcqChoice === i;
                    const stateClass = !feedback
                      ? isSelected
                        ? "border-[var(--pink)] bg-[var(--pink-light)]/40"
                        : "border-[var(--border-c)] hover:bg-[var(--mint)]/10"
                      : isSelected
                        ? feedback.correct
                          ? "border-[var(--mint-dark)] bg-[var(--mint)]/50"
                          : "border-red-400 bg-red-50"
                        : "border-[var(--border-c)] opacity-60";
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={!!feedback}
                        onClick={() => setMcqChoice(i)}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${stateClass}`}
                      >
                        <span className="font-medium text-[var(--secondary)]">{LETTERS[i]}</span>
                        <MathText text={choice} className="text-[var(--foreground)]" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="text"
                  value={submitted}
                  disabled={!!feedback}
                  onChange={(e) => setSubmitted(e.target.value)}
                  placeholder="예: 7/2 또는 0.5"
                  className="w-40 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
                />
              )}
            </div>

            {feedback && (
              <div
                className={`mt-6 rounded-xl p-4 text-sm ${
                  feedback.correct ? "bg-[var(--mint)]/40 text-[var(--mint-dark)]" : "bg-red-50 text-red-700"
                }`}
              >
                <p className="font-medium">{feedback.correct ? t("study_correct") : t("study_incorrect")}</p>
                {!feedback.correct && (
                  <MathText text={feedback.solution} className="mt-2 text-[var(--foreground)]" />
                )}
              </div>
            )}

            <div className="mt-6">
              {!feedback ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || (current.answerFormat === "mcq" ? mcqChoice === null : !submitted.trim())}
                  className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
                >
                  {t("study_submit")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={submitting}
                  className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
                >
                  {position + 1 < items.length ? t("study_next") : t("study_finish")}
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
