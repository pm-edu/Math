"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { MathText } from "@/components/ProblemBody";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import { DIFFICULTIES, FORMATS } from "@/lib/problems";
import { CURRICULUM_GROUPS, CURRICULUM_DETAILS, type CurriculumGroup } from "@/lib/curriculum";
import { topicsFor } from "@/lib/curriculum-topics";

type Draft = {
  content_text: string;
  choices: string[]; // 빈 배열이면 객관식 아님
  answer: string;
  solution_text: string;
  difficulty: string;
  problem_format: string;
  selfCheckAnswer: string | null;
  selfCheckMatch: boolean | null; // null = 검증 생략(서술형 등)
  imageUrl: string | null; // 함수 그래프 등 서버가 그려준 그림
  include: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E"];

export default function AdminGeneratePage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [curriculumGroup, setCurriculumGroup] = useState<CurriculumGroup>("KR");
  const [curriculumDetail, setCurriculumDetail] = useState("");
  const [unit, setUnit] = useState("");
  const [difficulty, setDifficulty] = useState<string>(DIFFICULTIES[1]);
  const [problemFormat, setProblemFormat] = useState<string>(FORMATS[0]);
  const [count, setCount] = useState(5);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) { setAllowed(false); return; }
      setAllowed(true);
    }
    init();
  }, [router]);

  async function handleGenerate() {
    setError(null); setMessage(null);
    if (!curriculumDetail || !unit) { setError("커리큘럼·세부 과정·단원을 모두 선택해주세요."); return; }
    setGenerating(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/generate-math-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ curriculumGroup, curriculumDetail, unit, difficulty, problemFormat, count }),
      });
      const data = await res.json();
      setGenerating(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "생성 실패"); return; }

      const list: Draft[] = (data.problems ?? []).map((p: Record<string, unknown>) => {
        const choices = Array.isArray(p.choices) ? (p.choices as string[]).filter((c) => c.trim()) : [];
        return {
          content_text: String(p.content_text ?? ""),
          choices,
          answer: String(p.answer ?? ""),
          solution_text: String(p.solution_text ?? ""),
          difficulty: String(p.difficulty ?? difficulty),
          problem_format: String(p.problem_format ?? problemFormat),
          selfCheckAnswer: (p.selfCheckAnswer as string | null) ?? null,
          selfCheckMatch: (p.selfCheckMatch as boolean | null) ?? null,
          imageUrl: (p.image_url as string | null) ?? null,
          include: true,
        };
      });
      setDrafts(list);
      setMessage(
        list.length > 0
          ? `${list.length}문제를 생성했습니다. AI 재검증 배지를 참고해 검토·수정한 뒤 저장하세요.`
          : "생성된 문제가 없습니다. 다시 시도해보세요."
      );
    } catch {
      setGenerating(false);
      setError("생성 중 오류가 발생했습니다.");
    }
  }

  function update(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function updateChoice(i: number, ci: number, value: string) {
    setDrafts((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, choices: d.choices.map((c, cj) => (cj === ci ? value : c)) } : d))
    );
  }

  async function handleSave() {
    setError(null); setMessage(null);
    const chosen = drafts.filter((d) => d.include && d.content_text.trim());
    if (chosen.length === 0) { setError("저장할 문제가 없습니다."); return; }
    setSaving(true);

    // 관리자가 이 화면에서 검토·수정하므로 verified=true (PDF 추출·SAT 생성과 동일한 원칙).
    const rows = chosen.map((d) => ({
      subject: "math",
      curriculum_group: curriculumGroup,
      curriculum_detail: curriculumDetail,
      unit,
      problem_format: d.problem_format,
      difficulty: d.difficulty,
      answer: d.answer.trim() || null,
      content_text: d.content_text.trim(),
      solution_text: d.solution_text.trim() || null,
      choices: d.choices.length ? d.choices.map((c) => c.trim()) : null,
      image_url: d.imageUrl ?? "",
      problem_type: "text",
      source: "ai",
      verified: true,
    }));

    const { error: insErr } = await createClient().from("problems").insert(rows);
    setSaving(false);
    if (insErr) { setError(`저장 실패: ${insErr.message}`); return; }
    setMessage(`${rows.length}문제를 문제은행에 저장했습니다.`);
    setDrafts([]);
  }

  if (allowed === null)
    return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false)
    return (
      <Shell>
        <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
      </Shell>
    );

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">AI 문제 생성 (수학)</h1>
        <p className="mt-2 text-[var(--secondary)]">
          조건을 정하면 AI가 문제를 만들고, 스스로 다시 풀어 정답을 재검증한 결과도 같이 보여줍니다. 확인·수정 후 저장하세요.
          <br />
          AI가 틀릴 수 있으니 <b>재검증 배지가 "불일치"인 문제는 특히 꼼꼼히 확인</b>해주세요.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">커리큘럼</label>
              <select
                value={curriculumGroup}
                onChange={(e) => { setCurriculumGroup(e.target.value as CurriculumGroup); setCurriculumDetail(""); setUnit(""); }}
                className={inputClass}
              >
                {CURRICULUM_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">세부 과정</label>
              <select
                value={curriculumDetail}
                onChange={(e) => { setCurriculumDetail(e.target.value); setUnit(""); }}
                className={inputClass}
              >
                <option value="">(선택)</option>
                {CURRICULUM_DETAILS[curriculumGroup].map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-[var(--foreground)]">단원</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} disabled={!curriculumDetail}>
              <option value="">{curriculumDetail ? "(선택)" : "세부 과정을 먼저 선택하세요"}</option>
              {topicsFor(curriculumDetail).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">유형</label>
              <select value={problemFormat} onChange={(e) => setProblemFormat(e.target.value)} className={inputClass}>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputClass}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">문제 수</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}문제</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {generating ? "생성 중... (수십 초, 재검증까지 포함)" : "AI로 생성"}
          </button>
        </div>

        {drafts.length > 0 && (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[var(--foreground)]">생성된 문제 {drafts.length}개 (검토 후 저장)</h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[var(--mint)] px-6 py-2.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60"
              >
                {saving ? "저장 중..." : "선택 문제 저장"}
              </button>
            </div>

            <ul className="mt-4 space-y-4">
              {drafts.map((d, i) => (
                <li key={i} className={`rounded-2xl border bg-white p-5 ${d.include ? "border-[var(--border-c)]" : "border-[var(--border-c)] opacity-50"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--secondary)]">{i + 1}번 · {d.problem_format} · {d.difficulty}</span>
                    <div className="flex items-center gap-2">
                      {d.imageUrl && (
                        <span className="rounded-full bg-[var(--pink-light)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--pink-dark)]">그래프 포함</span>
                      )}
                      {d.selfCheckMatch === null ? (
                        <span className="rounded-full border border-[var(--border-c)] px-2.5 py-0.5 text-[11px] text-[var(--secondary)]">AI 재검증 생략</span>
                      ) : d.selfCheckMatch ? (
                        <span className="rounded-full bg-[var(--mint)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--mint-dark)]">AI 재검증 일치 ✓</span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                          AI 재검증 불일치 ⚠ (AI가 다시 풀면: {d.selfCheckAnswer})
                        </span>
                      )}
                      <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                        <input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} />
                        저장 포함
                      </label>
                    </div>
                  </div>

                  <label className="mt-3 block text-xs text-[var(--secondary)]">문제 본문</label>
                  <textarea rows={3} value={d.content_text} onChange={(e) => update(i, { content_text: e.target.value })} className={inputClass} />

                  {d.content_text.trim() && (
                    <div className="mt-2 rounded-lg border border-dashed border-[var(--border-c)] bg-[var(--pink-light)]/20 p-3">
                      <p className="mb-1 text-xs text-[var(--secondary)]">학생 화면 미리보기</p>
                      <MathText text={d.content_text} className="text-[15px] leading-relaxed text-[var(--foreground)]" />
                      {d.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.imageUrl} alt="그래프" className="mt-2 rounded-lg border border-[var(--border-c)] bg-white" />
                      )}
                    </div>
                  )}

                  {d.choices.length > 0 ? (
                    <>
                      <label className="mt-3 block text-xs text-[var(--secondary)]">보기 (정답을 라디오로 선택)</label>
                      <div className="mt-1 space-y-2">
                        {d.choices.map((c, ci) => (
                          <div key={ci} className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`ans-${i}`}
                                checked={d.answer === LETTERS[ci]}
                                onChange={() => update(i, { answer: LETTERS[ci] })}
                                title="정답으로 지정"
                              />
                              <span className="w-5 text-sm font-medium text-[var(--secondary)]">{LETTERS[ci]}</span>
                              {c.trim() ? (
                                <MathText text={c} className="flex-1 text-[var(--foreground)]" />
                              ) : (
                                <span className="flex-1 text-sm text-[var(--secondary)]">(빈 보기)</span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={c}
                              onChange={(e) => updateChoice(i, ci, e.target.value)}
                              placeholder="원본 텍스트 수정 (LaTeX는 $...$)"
                              className="mt-1.5 w-full rounded-md border border-dashed border-[var(--border-c)] bg-[var(--background)] px-2 py-1 text-xs text-[var(--secondary)] outline-none focus:border-[var(--pink)]"
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <label className="mt-3 block text-xs text-[var(--secondary)]">정답</label>
                      <input
                        type="text"
                        value={d.answer}
                        onChange={(e) => update(i, { answer: e.target.value })}
                        className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                      />
                    </>
                  )}

                  <label className="mt-3 block text-xs text-[var(--secondary)]">풀이</label>
                  <textarea rows={3} value={d.solution_text} onChange={(e) => update(i, { solution_text: e.target.value })} className={inputClass} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">{children}</main>
      <Footer />
    </>
  );
}
