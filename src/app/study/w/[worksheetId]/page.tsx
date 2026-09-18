"use client";

// RUN_MATH_SITE.md 5-1: 문제지 풀이 화면. 실제 채점·진행 갱신은 전부 서버(4-5 worksheet.ts,
// service role)가 하고, 이 화면은 /api/study/worksheets/[id]/{start,answer,finish,retry}만 부른다.
// answer_spec/정답은 API 응답 자체에 없으니 여기서 보여줄 수도 없다.

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";
import { MathText } from "@/components/ProblemBody";

interface WorksheetItem {
  position: number;
  problemId: string;
  contentText: string;
  imageUrl: string;
  answerFormat: "mcq" | "numeric" | "expression" | "free";
  choices: string[];
  difficulty: string;
}

async function authedFetch(path: string, body?: unknown) {
  const supabase = createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.message ?? "요청 실패");
  return data;
}

export default function WorksheetSolvePage() {
  const params = useParams<{ worksheetId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLang();
  const worksheetId = params.worksheetId;
  const isRetry = searchParams.get("retry") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worksheetTitle, setWorksheetTitle] = useState("");
  const [total, setTotal] = useState(0);
  const [answeredBeforeCount, setAnsweredBeforeCount] = useState(0);
  const [queue, setQueue] = useState<WorksheetItem[]>([]);
  const [cursor, setCursor] = useState(0);
  const [submitted, setSubmitted] = useState<{ correct: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      try {
        if (isRetry) {
          // 80% 미달 후 "틀린 문제만 다시"(RUN_MATH_SITE.md 1단계) — retryWrong이 이미 오답/미시도만
          // 골라서 주므로 여기선 그 목록 전체가 곧 큐다(이전 시도로 인한 진행률 보정은 안 함).
          const data = await authedFetch(`/api/study/worksheets/${worksheetId}/retry`);
          const stored = sessionStorage.getItem(`math_worksheet_result_${worksheetId}`);
          setWorksheetTitle(stored ? (JSON.parse(stored).worksheetTitle ?? "") : "");
          setTotal(data.items.length);
          setAnsweredBeforeCount(0);
          setQueue(data.items as WorksheetItem[]);
        } else {
          const data = await authedFetch(`/api/study/worksheets/${worksheetId}/start`);
          setWorksheetTitle(data.worksheetTitle);
          setTotal(data.items.length);
          const answered = new Set<string>(data.answeredProblemIds);
          setAnsweredBeforeCount(answered.size);
          setQueue((data.items as WorksheetItem[]).filter((it) => !answered.has(it.problemId)));
        }
        setStartedAt(Date.now());
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오기에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worksheetId]);

  const current = queue[cursor] ?? null;

  async function handleSubmit() {
    if (!current || !input.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
      const data = await authedFetch(`/api/study/worksheets/${worksheetId}/answer`, {
        problemId: current.problemId,
        submitted: input.trim(),
        elapsedSeconds,
      });
      setSubmitted({ correct: data.correct });
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setSubmitted(null);
    setInput("");
    setStartedAt(Date.now());
    setCursor((c) => c + 1);
  }

  async function handleFinish() {
    setFinishing(true);
    setError(null);
    try {
      const data = await authedFetch(`/api/study/worksheets/${worksheetId}/finish`);
      sessionStorage.setItem(`math_worksheet_result_${worksheetId}`, JSON.stringify(data));
      router.push(`/study/w/${worksheetId}/result`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "완료 처리에 실패했습니다.");
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-medium text-[var(--foreground)]">{worksheetTitle}</h1>
          <span className="text-xs text-[var(--secondary)]">
            {t("study_worksheetProgress")} {answeredBeforeCount + cursor}/{total}
          </span>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {!current ? (
          <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
            >
              {finishing ? t("study_loading") : t("study_finishButton")}
            </button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
            <MathText text={current.contentText} className="text-[15px] leading-relaxed text-[var(--foreground)]" />
            {current.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.imageUrl} alt="문제 그림" className="mt-3 max-w-[280px]" />
            )}

            {current.answerFormat === "mcq" ? (
              <div className="mt-5 space-y-2">
                {current.choices.map((choice, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(String(i))}
                    disabled={submitted !== null}
                    className={`block w-full rounded-lg border px-4 py-2.5 text-left text-sm ${
                      input === String(i)
                        ? "border-[var(--pink)] bg-[var(--pink-light)]/40"
                        : "border-[var(--border-c)] bg-white"
                    }`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={submitted !== null}
                placeholder="정답 입력"
                className="mt-5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
              />
            )}

            {submitted && (
              <p className={`mt-3 text-sm font-medium ${submitted.correct ? "text-[var(--mint-dark)]" : "text-red-600"}`}>
                {submitted.correct ? t("study_correct") : t("study_incorrect")}
              </p>
            )}

            <div className="mt-5 flex justify-end">
              {submitted === null ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !input.trim()}
                  className="rounded-full bg-[var(--pink)] px-6 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
                >
                  {submitting ? t("study_loading") : t("study_submit")}
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  className="rounded-full bg-[var(--mint)] px-6 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  {cursor + 1 < queue.length ? t("study_next") : t("study_finish")}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
