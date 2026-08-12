"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { ProblemBody, MathText } from "@/components/ProblemBody";
import type { Problem } from "@/lib/problems";

type Submission = {
  problem_id: string;
  submitted_answer: string | null;
  is_correct: boolean | null;
};

// 답 비교용 정규화: 공백 제거 + 소문자 (③ vs ③, x = 2 vs x=2 등 가벼운 차이 흡수)
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

// 한 문제 채점: 정답이 없거나 서술형이면 자동채점 불가(null)
function gradeOne(p: Problem, ans: string): boolean | null {
  if (!p.answer) return null;
  if (p.problem_format === "서술형") return null;
  return norm(ans) === norm(p.answer);
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
  const [problems, setProblems] = useState<Problem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean | null>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      setUserId(auth.user.id);

      const { data: ws } = await supabase.from("worksheets").select("title").eq("id", id).maybeSingle();
      if (!ws) { setLoading(false); return; }
      setTitle(ws.title);

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
      }
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function handleSubmit() {
    if (!userId) return;
    setError(null);
    const answered = problems.filter((p) => (answers[p.id] ?? "").trim()).length;
    if (answered === 0) {
      setError("답을 하나 이상 입력한 뒤 제출해주세요.");
      return;
    }
    if (!confirm("제출하면 채점되고 답지가 공개됩니다. 제출할까요?")) return;

    setSaving(true);
    const rows = problems.map((p) => {
      const ans = (answers[p.id] ?? "").trim();
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
  }

  function retry() {
    if (!confirm("다시 풀면 이전 제출 결과가 지워집니다. 계속할까요?")) return;
    setSubmitted(false);
    setResults({});
  }

  const gradable = problems.filter((p) => results[p.id] !== null && results[p.id] !== undefined);
  const correctCount = gradable.filter((p) => results[p.id] === true).length;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/worksheets" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
          ← 내 학습지로
        </Link>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-3xl font-medium text-[var(--foreground)]">{title || "학습지"}</h1>
              {submitted && (
                <button
                  onClick={retry}
                  className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/40"
                >
                  다시 풀기
                </button>
              )}
            </div>

            {/* 제출 후 점수 요약 */}
            {submitted && (
              <div className="mt-4 rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-5 py-4">
                <p className="text-sm text-[var(--foreground)]">
                  제출 완료 · 자동채점 결과{" "}
                  <span className="font-bold text-[var(--mint-dark)]">
                    {gradable.length > 0 ? `${correctCount} / ${gradable.length} 정답` : "채점 가능한 문제 없음"}
                  </span>
                </p>
                {problems.length > gradable.length && (
                  <p className="mt-1 text-xs text-[var(--secondary)]">
                    서술형·정답 미등록 문제는 자동채점되지 않아 답지만 공개됩니다.
                  </p>
                )}
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            {problems.length === 0 ? (
              <p className="mt-10 text-sm text-[var(--secondary)]">문제가 없습니다.</p>
            ) : (
              <>
                <ol className="mt-8 space-y-8">
                  {problems.map((p, i) => {
                    const res = results[p.id];
                    return (
                      <li key={p.id}>
                        <div className="mb-2 flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--secondary)]">{i + 1}번</p>
                          {submitted && res === true && (
                            <span className="rounded-full bg-[var(--mint)] px-2 py-0.5 text-xs font-medium text-[var(--mint-dark)]">맞음</span>
                          )}
                          {submitted && res === false && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">틀림</span>
                          )}
                          {submitted && (res === null || res === undefined) && (
                            <span className="rounded-full bg-[var(--pink-light)] px-2 py-0.5 text-xs text-[var(--secondary)]">채점 안 됨</span>
                          )}
                        </div>

                        <ProblemBody
                          problem={p}
                          imgClassName="w-full rounded-xl border border-[var(--border-c)]"
                          textClassName="rounded-xl border border-[var(--border-c)] bg-white p-5 text-[15px] leading-relaxed text-[var(--foreground)]"
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
                                            ? "border-[var(--pink)] bg-[var(--pink-light)]/40"
                                            : "border-[var(--border-c)] bg-white hover:bg-[var(--mint)]/20"
                                        }`}
                                      >
                                        <span className="font-semibold text-[var(--secondary)]">{letter}</span>
                                        <span className="text-[var(--foreground)]">{c}</span>
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
                                  const isCorrect = norm(letter) === norm(p.answer);
                                  const isMine = answers[p.id] === letter;
                                  return (
                                    <div
                                      key={ci}
                                      className={`flex w-full items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${
                                        isCorrect
                                          ? "border-[var(--mint-dark)] bg-[var(--mint)]/40"
                                          : isMine
                                          ? "border-red-400 bg-red-50"
                                          : "border-[var(--border-c)] bg-white"
                                      }`}
                                    >
                                      <span className="font-semibold text-[var(--secondary)]">{letter}</span>
                                      <span className="flex-1 text-[var(--foreground)]">{c}</span>
                                      {isCorrect && <span className="text-xs font-medium text-[var(--mint-dark)]">정답</span>}
                                      {isMine && !isCorrect && <span className="text-xs font-medium text-red-600">내 선택</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }

                          return !submitted ? (
                            <div className="mt-3">
                              <label className="text-xs text-[var(--secondary)]">내 답</label>
                              <input
                                type="text"
                                value={answers[p.id] ?? ""}
                                onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                placeholder="정답 입력"
                                className="mt-1 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
                              />
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-[var(--secondary)]">
                              내 답: <span className="text-[var(--foreground)]">{answers[p.id]?.trim() || "(무응답)"}</span>
                            </p>
                          );
                        })()}

                        {/* 답지 (제출 후에만 공개): 정답 + 풀이 */}
                        {submitted && (
                          <div className="mt-2 rounded-xl border border-[var(--border-c)] bg-[var(--mint)]/20 p-4">
                            {p.answer ? (
                              <p className="text-sm text-[var(--foreground)]">
                                <span className="font-medium">정답:</span> {p.answer}
                              </p>
                            ) : (
                              <p className="text-sm text-[var(--secondary)]">정답이 아직 등록되지 않았습니다.</p>
                            )}
                            {p.solution_text && (
                              <div className="mt-2">
                                <p className="mb-1 text-xs font-medium text-[var(--secondary)]">풀이</p>
                                <MathText
                                  text={p.solution_text}
                                  className="text-sm leading-relaxed text-[var(--foreground)]"
                                />
                              </div>
                            )}
                            {p.solution_image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.solution_image_url} alt={`${i + 1}번 해설`} className="mt-2 w-full rounded-lg border border-[var(--border-c)]" />
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
                      onClick={handleSubmit}
                      disabled={saving}
                      className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
                    >
                      {saving ? "제출 중..." : "제출하고 답지 보기"}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
