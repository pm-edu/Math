"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody, MathText } from "@/components/ProblemBody";
import type { Problem } from "@/lib/problems";
import { normAnswer } from "@/lib/grading";
import { logQuestionAttempts } from "@/lib/question-attempts";

type Submission = {
  problem_id: string;
  submitted_answer: string | null;
  is_correct: boolean | null;
};

// 한 문제 채점(연습용 문제지에서만 씀): 정답이 없거나 서술형이면 자동채점 불가(null)
function gradeOne(p: Problem, ans: string): boolean | null {
  if (!p.answer) return null;
  if (p.problem_format === "서술형") return null;
  return normAnswer(ans) === normAnswer(p.answer);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function WorksheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [worksheetSubject, setWorksheetSubject] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean | null>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [scoreSummary, setScoreSummary] = useState<{ correct: number; gradable: number } | null>(null);

  // 실전 시험 모드
  const [isExam, setIsExam] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [examStarted, setExamStarted] = useState(false);
  const [examDeadline, setExamDeadline] = useState<number | null>(null); // epoch ms
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [startingExam, setStartingExam] = useState(false);
  const autoSubmittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const { data: ws } = await supabase
        .from("worksheets")
        .select("title, subject, is_exam, time_limit_minutes")
        .eq("id", id)
        .maybeSingle();
      if (!ws) { setLoading(false); return; }
      setTitle(ws.title);
      setWorksheetSubject(ws.subject);
      setIsExam(!!ws.is_exam);
      setTimeLimitMinutes(ws.time_limit_minutes ?? null);

      const { data } = await supabase
        .from("worksheet_problems")
        .select("position, problem:problems(*)")
        .eq("worksheet_id", id)
        .order("position");

      const list = (data ?? [])
        .flatMap((r) => {
          const p = (r as { problem: Problem | Problem[] | null }).problem;
          return Array.isArray(p) ? p : p ? [p] : [];
        });
      setProblems(list);

      // 이미 제출한 기록이 있으면 불러와 결과 화면으로 바로 보여준다
      const { data: subs } = await supabase
        .from("problem_submissions")
        .select("problem_id, submitted_answer, is_correct")
        .eq("worksheet_id", id)
        .eq("user_id", auth.user.id);

      if (subs && subs.length > 0) {
        const a: Record<string, string> = {};
        const r: Record<string, boolean | null> = {};
        (subs as Submission[]).forEach((s) => {
          a[s.problem_id] = s.submitted_answer ?? "";
          r[s.problem_id] = s.is_correct;
        });
        setAnswers(a);
        setResults(r);
        setSubmitted(true);
      } else if (ws.is_exam) {
        // 이미 시작한 적이 있으면(새로고침 등) 시작 화면 없이 바로 남은 시간으로 이어간다.
        const { data: attempt } = await supabase
          .from("worksheet_attempts")
          .select("started_at, submitted_at")
          .eq("worksheet_id", id)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (attempt && !attempt.submitted_at && ws.time_limit_minutes) {
          const deadline = new Date(attempt.started_at).getTime() + ws.time_limit_minutes * 60_000;
          setExamDeadline(deadline);
          setExamStarted(true);
          setStartedAt(new Date(attempt.started_at).getTime());
        }
      } else {
        setStartedAt(Date.now());
      }
      setLoading(false);
    }
    load();
  }, [id, router]);

  // 실전 시험 타이머
  useEffect(() => {
    if (!isExam || !examStarted || !examDeadline || submitted) return;
    const tick = () => {
      const left = Math.round((examDeadline - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        handleSubmit(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExam, examStarted, examDeadline, submitted]);

  async function startExam() {
    setError(null);
    setStartingExam(true);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const res = await fetch(`/api/worksheets/${id}/start-attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setStartingExam(false);
    if (!res.ok || !data.ok) { setError(data.message ?? "시험 시작에 실패했습니다."); return; }
    const deadline = new Date(data.startedAt).getTime() + (data.timeLimitMinutes ?? 0) * 60_000;
    setExamDeadline(deadline);
    setExamStarted(true);
    setStartedAt(new Date(data.startedAt).getTime());
  }

  async function handleSubmit(auto = false) {
    if (!userId) return;
    setError(null);
    const currentAnswers = answersRef.current;
    const answered = problems.filter((p) => (currentAnswers[p.id] ?? "").trim()).length;
    if (!auto) {
      if (answered === 0) {
        setError("답을 하나 이상 입력한 뒤 제출해주세요.");
        return;
      }
      const confirmMsg = isExam
        ? "제출하면 채점되고, 실전 시험은 다시 응시할 수 없습니다. 제출할까요?"
        : "제출하면 채점되고 답지가 공개됩니다. 제출할까요?";
      if (!confirm(confirmMsg)) return;
    }

    setSaving(true);

    if (isExam) {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`/api/worksheets/${id}/submit-attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: currentAnswers }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "제출에 실패했습니다."); return; }
      setResults(data.results ?? {});
      setScoreSummary({ correct: data.correctCount ?? 0, gradable: data.gradableCount ?? 0 });
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // 연습용 문제지(기존 방식): 클라이언트에서 채점해 바로 저장
    const rows = problems.map((p) => {
      const ans = (currentAnswers[p.id] ?? "").trim();
      return {
        user_id: userId,
        problem_id: p.id,
        worksheet_id: id,
        submitted_answer: ans || null,
        is_correct: gradeOne(p, ans),
      };
    });

    const { error: subErr } = await createClient()
      .from("problem_submissions")
      .upsert(rows, { onConflict: "user_id,problem_id,worksheet_id" });
    setSaving(false);
    if (subErr) { setError(`제출 실패: ${subErr.message}`); return; }

    const r: Record<string, boolean | null> = {};
    rows.forEach((row) => (r[row.problem_id] = row.is_correct));
    setResults(r);
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 문항별 시도 이력 기록(통계용, 실패해도 위 제출 결과에는 영향 없음).
    // elapsed_seconds는 문제별 정밀 시간이 아니라 이 학습지를 연 뒤 제출까지 걸린 전체 시간이다.
    const graded = problems
      .map((p) => ({ problem: p, isCorrect: r[p.id] }))
      .filter((g): g is { problem: Problem; isCorrect: boolean } => g.isCorrect !== null && g.isCorrect !== undefined);
    const elapsedSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    logQuestionAttempts(userId, id, graded, elapsedSeconds).catch(() => {});
  }

  function retry() {
    if (!confirm("다시 풀면 이전 제출 결과가 지워집니다. 계속할까요?")) return;
    setSubmitted(false);
    setResults({});
    setStartedAt(Date.now());
  }

  const gradable = problems.filter((p) => results[p.id] !== null && results[p.id] !== undefined);
  const correctCount = scoreSummary ? scoreSummary.correct : gradable.filter((p) => results[p.id] === true).length;
  const gradableCount = scoreSummary ? scoreSummary.gradable : gradable.length;

  const showExamStartScreen = isExam && !submitted && !examStarted && !loading;

  return (
    <>
      <Header />
      <main
        data-theme={worksheetSubject === "english" ? "en" : undefined}
        className="min-h-screen bg-en-paper"
      >
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Link href="/worksheets" className="text-sm text-en-ink-soft underline hover:text-en-ink">
            ← 내 학습지로
          </Link>

          {loading ? (
            <p className="mt-10 text-sm text-en-ink-soft">불러오는 중...</p>
          ) : showExamStartScreen ? (
            <div className="mt-6 rounded-2xl border border-en-line bg-en-card p-8 shadow-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-en-gold-soft px-3 py-1 text-xs font-bold text-en-gold-deep">
                ⏱ 실전 시험
              </span>
              <h1 className="mt-4 text-xl font-bold text-en-ink">{title || "문제지"}</h1>
              <p className="mt-1 text-sm text-en-ink-soft">시작을 누르면 바로 타이머가 시작됩니다.</p>

              <dl className="mt-6 divide-y divide-en-line border-t border-en-line text-sm">
                <div className="flex items-center justify-between py-3">
                  <dt className="font-semibold text-en-ink-soft">문항 수</dt>
                  <dd className="font-bold text-en-ink">{problems.length}문항</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="font-semibold text-en-ink-soft">제한 시간</dt>
                  <dd className="font-bold text-en-ink">{timeLimitMinutes}분</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="font-semibold text-en-ink-soft">응시 횟수</dt>
                  <dd className="font-bold text-en-ink">1회</dd>
                </div>
              </dl>

              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
                ⚠ 제출 후에는 다시 풀 수 없습니다. 시간이 다 되면 그때까지 답한 것으로 자동 제출됩니다.
              </p>

              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

              <button
                onClick={startExam}
                disabled={startingExam}
                className="mt-6 w-full rounded-[11px] bg-en-gold py-3.5 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
              >
                {startingExam ? "시작하는 중..." : "준비됐어요, 시작하기"}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <h1 className="flex items-center gap-2 text-3xl font-bold text-en-ink">
                  {title || "학습지"}
                  {isExam && (
                    <span className="rounded-full bg-en-gold-soft px-2.5 py-0.5 text-xs font-bold text-en-gold-deep">
                      ⏱ 실전 시험
                    </span>
                  )}
                </h1>
                {submitted && !isExam && (
                  <button
                    onClick={retry}
                    className="rounded-full border border-en-line bg-white px-4 py-1.5 text-sm text-en-ink hover:bg-en-gold-soft/40"
                  >
                    다시 풀기
                  </button>
                )}
              </div>

              {/* 실전 시험 응시 중 타이머 바 */}
              {isExam && examStarted && !submitted && remainingSec !== null && (
                <div className="sticky top-2 z-10 mt-4 flex items-center justify-between rounded-[13px] bg-en-ink px-4 py-3 shadow-md">
                  <span className="text-xs font-bold text-en-ink-soft">
                    {problems.filter((p) => (answers[p.id] ?? "").trim()).length} / {problems.length} 답변함
                  </span>
                  <span className={`font-mono text-base font-bold ${remainingSec <= 60 ? "text-red-400" : "text-en-gold"}`}>
                    남은 시간 · {formatClock(remainingSec)}
                  </span>
                </div>
              )}

              {/* 제출 후 점수 요약 */}
              {submitted && (
                <div className="mt-4 rounded-2xl border border-en-line bg-en-card px-5 py-4 shadow-sm">
                  <p className="text-sm text-en-ink">
                    제출 완료 · 자동채점 결과{" "}
                    <span className="font-bold text-en-gold-deep">
                      {gradableCount > 0 ? `${correctCount} / ${gradableCount} 정답` : "채점 가능한 문제 없음"}
                    </span>
                  </p>
                  {problems.length > gradableCount && (
                    <p className="mt-1 text-xs text-en-ink-soft">
                      서술형·정답 미등록 문제는 자동채점되지 않아 답지만 공개됩니다.
                    </p>
                  )}
                  {isExam && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-en-paper px-3 py-2.5 text-xs text-en-ink-soft">
                      🔒 실전 시험은 1회만 응시할 수 있어 다시 풀기 버튼이 없습니다.
                    </p>
                  )}
                </div>
              )}

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              {problems.length === 0 ? (
                <p className="mt-10 text-sm text-en-ink-soft">문제가 없습니다.</p>
              ) : (
                <>
                  <ol className="mt-8 space-y-8">
                    {problems.map((p, i) => {
                      const res = results[p.id];
                      return (
                        <li key={p.id}>
                          <div className="mb-2 flex items-center gap-2">
                            <p className="text-sm font-bold text-en-ink-soft">{i + 1}번</p>
                            {submitted && res === true && (
                              <span className="rounded-full bg-en-gold-soft px-2 py-0.5 text-xs font-bold text-en-gold-deep">맞음</span>
                            )}
                            {submitted && res === false && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">틀림</span>
                            )}
                            {submitted && (res === null || res === undefined) && (
                              <span className="rounded-full bg-en-line px-2 py-0.5 text-xs text-en-ink-soft">채점 안 됨</span>
                            )}
                          </div>

                          <ProblemBody
                            problem={p}
                            imgClassName="w-full rounded-xl border border-en-line"
                            textClassName="rounded-xl border border-en-line bg-white p-5 text-[15px] leading-relaxed text-en-ink"
                          />

                          {/* 답 입력. 보기(choices)가 있으면 객관식(A~D 클릭), 없으면 자유 입력 */}
                          {(() => {
                            const choices = (p.choices ?? []).filter((c) => (c ?? "").trim());
                            const isMcq = choices.length > 0;

                            if (isMcq) {
                              if (!submitted) {
                                return (
                                  <div className="mt-3 space-y-2">
                                    {choices.map((c, ci) => {
                                      const letter = String.fromCharCode(65 + ci);
                                      const selected = answers[p.id] === letter;
                                      return (
                                        <button
                                          key={ci}
                                          type="button"
                                          onClick={() => setAnswers((prev) => ({ ...prev, [p.id]: letter }))}
                                          className={`flex w-full items-start gap-3 rounded-lg border px-4 py-2.5 text-left text-sm transition-colors ${
                                            selected
                                              ? "border-en-gold bg-en-gold-soft/60"
                                              : "border-en-line bg-white hover:bg-en-gold-soft/20"
                                          }`}
                                        >
                                          <span className="font-semibold text-en-ink-soft">{letter}</span>
                                          <MathText text={c} className="text-en-ink" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-3 space-y-2">
                                  {choices.map((c, ci) => {
                                    const letter = String.fromCharCode(65 + ci);
                                    const isCorrect = normAnswer(letter) === normAnswer(p.answer);
                                    const isMine = answers[p.id] === letter;
                                    return (
                                      <div
                                        key={ci}
                                        className={`flex w-full items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${
                                          isCorrect
                                            ? "border-en-gold-deep bg-en-gold-soft/60"
                                            : isMine
                                            ? "border-red-400 bg-red-50"
                                            : "border-en-line bg-white"
                                        }`}
                                      >
                                        <span className="font-semibold text-en-ink-soft">{letter}</span>
                                        <MathText text={c} className="flex-1 text-en-ink" />
                                        {isCorrect && <span className="text-xs font-bold text-en-gold-deep">정답</span>}
                                        {isMine && !isCorrect && <span className="text-xs font-medium text-red-600">내 선택</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            return !submitted ? (
                              <div className="mt-3">
                                <label className="text-xs text-en-ink-soft">내 답</label>
                                <input
                                  type="text"
                                  value={answers[p.id] ?? ""}
                                  onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                  placeholder="정답 입력"
                                  className="mt-1 w-full rounded-lg border border-en-line bg-white px-4 py-2.5 text-sm outline-none focus:border-en-gold"
                                />
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-en-ink-soft">
                                내 답: <span className="text-en-ink">{answers[p.id]?.trim() || "(무응답)"}</span>
                              </p>
                            );
                          })()}

                          {/* 답지 (제출 후에만 공개): 정답 + 풀이 */}
                          {submitted && (
                            <div className="mt-2 rounded-xl border border-en-line bg-en-gold-soft/30 p-4">
                              {p.answer ? (
                                <p className="text-sm text-en-ink">
                                  <span className="font-semibold">정답:</span> {p.answer}
                                </p>
                              ) : (
                                <p className="text-sm text-en-ink-soft">정답이 아직 등록되지 않았습니다.</p>
                              )}
                              {p.solution_text && (
                                <div className="mt-2">
                                  <p className="mb-1 text-xs font-semibold text-en-ink-soft">풀이</p>
                                  <MathText
                                    text={p.solution_text}
                                    className="text-sm leading-relaxed text-en-ink"
                                  />
                                </div>
                              )}
                              {p.solution_image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.solution_image_url} alt={`${i + 1}번 해설`} className="mt-2 w-full rounded-lg border border-en-line" />
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {!submitted && (
                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={() => handleSubmit(false)}
                        disabled={saving}
                        className="rounded-[11px] bg-en-gold px-8 py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
                      >
                        {saving ? "제출 중..." : "제출하고 답지 보기"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
