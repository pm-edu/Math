"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

type Draft = {
  passage: string;
  question: string;
  choices: string[]; // 4개
  answer: string; // "A" ~ "D"
  explanation: string;
  skill: string;
  difficulty: string;
  include: boolean;
};

const LETTERS = ["A", "B", "C", "D"];

// SAT 난이도(easy/medium/hard) → 우리 난이도(하/중/상)
function mapDifficulty(d: string): string {
  const s = (d || "").toLowerCase();
  if (s.startsWith("easy") || s === "하") return "하";
  if (s.startsWith("hard") || s === "상") return "상";
  return "중";
}

export default function AdminSatPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const [count, setCount] = useState(5);
  const [skill, setSkill] = useState("Reading and Writing (mixed)");
  const [difficulty, setDifficulty] = useState("medium");
  const [topic, setTopic] = useState("");

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
    setGenerating(true);
    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/generate-sat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ count, skill, difficulty, topic }),
      });
      const data = await res.json();
      setGenerating(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "생성 실패"); return; }

      const list: Draft[] = (data.problems ?? []).map((p: Record<string, unknown>) => {
        const choices = Array.isArray(p.choices) ? (p.choices as string[]).slice(0, 4) : [];
        while (choices.length < 4) choices.push("");
        const ans = String(p.answer ?? "A").trim().toUpperCase().slice(0, 1);
        return {
          passage: String(p.passage ?? ""),
          question: String(p.question ?? ""),
          choices,
          answer: LETTERS.includes(ans) ? ans : "A",
          explanation: String(p.explanation ?? ""),
          skill: String(p.skill ?? skill),
          difficulty: String(p.difficulty ?? difficulty),
          include: true,
        };
      });
      setDrafts(list);
      setMessage(
        list.length > 0
          ? `${list.length}문제를 생성했습니다. 반드시 검토·수정한 뒤 저장하세요.`
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
      prev.map((d, idx) =>
        idx === i ? { ...d, choices: d.choices.map((c, cj) => (cj === ci ? value : c)) } : d
      )
    );
  }

  async function handleSave() {
    setError(null); setMessage(null);
    const chosen = drafts.filter((d) => d.include && d.question.trim());
    if (chosen.length === 0) { setError("저장할 문제가 없습니다."); return; }
    setSaving(true);

    // 관리자가 검토하고 저장하므로 verified=true. 영어/SAT 객관식으로 저장.
    const rows = chosen.map((d) => ({
      subject: "english",
      category: "SAT",
      course_level: d.skill.trim() || null,
      unit: null,
      problem_format: "객관식",
      difficulty: mapDifficulty(d.difficulty),
      answer: d.answer,
      content_text: `${d.passage.trim()}\n\n${d.question.trim()}`.trim(),
      solution_text: d.explanation.trim() || null,
      choices: d.choices.map((c) => c.trim()),
      image_url: "",
      problem_type: "text",
      source: "ai",
      verified: true,
    }));

    const { error: insErr } = await createClient().from("problems").insert(rows);
    setSaving(false);
    if (insErr) { setError(`저장 실패: ${insErr.message}`); return; }
    setMessage(`${rows.length}문제를 문제은행(영어/SAT)에 저장했습니다.`);
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
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">영어 SAT 문제 생성</h1>
        <p className="mt-2 text-[var(--secondary)]">
          AI가 SAT(Reading &amp; Writing) 형식의 객관식 문제를 만듭니다. 확인·수정 후 저장하세요.
          <br />
          AI가 틀릴 수 있으니 <b>정답과 지문을 반드시 검토</b>한 뒤 저장해 주세요.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">문제 수</label>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n}문제</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputClass}>
                <option value="easy">쉬움 (easy)</option>
                <option value="medium">보통 (medium)</option>
                <option value="hard">어려움 (hard)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">영역(skill)</label>
              <select value={skill} onChange={(e) => setSkill(e.target.value)} className={inputClass}>
                <option value="Reading and Writing (mixed)">전체 (mixed)</option>
                <option value="Information and Ideas">Information and Ideas</option>
                <option value="Craft and Structure">Craft and Structure</option>
                <option value="Expression of Ideas">Expression of Ideas</option>
                <option value="Standard English Conventions">Standard English Conventions</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm text-[var(--foreground)]">주제 (선택)</label>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: science, history, literature" className={inputClass} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {generating ? "생성 중... (수십 초)" : "AI로 생성"}
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
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--secondary)]">{i + 1}번 · {d.skill}</span>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                      <input type="checkbox" checked={d.include} onChange={(e) => update(i, { include: e.target.checked })} />
                      저장 포함
                    </label>
                  </div>

                  <label className="mt-3 block text-xs text-[var(--secondary)]">지문 (Passage)</label>
                  <textarea rows={3} value={d.passage} onChange={(e) => update(i, { passage: e.target.value })} className={inputClass} />

                  <label className="mt-3 block text-xs text-[var(--secondary)]">질문 (Question)</label>
                  <textarea rows={2} value={d.question} onChange={(e) => update(i, { question: e.target.value })} className={inputClass} />

                  <label className="mt-3 block text-xs text-[var(--secondary)]">보기 (정답을 라디오로 선택)</label>
                  <div className="mt-1 space-y-2">
                    {d.choices.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`ans-${i}`}
                          checked={d.answer === LETTERS[ci]}
                          onChange={() => update(i, { answer: LETTERS[ci] })}
                          title="정답으로 지정"
                        />
                        <span className="w-5 text-sm font-medium text-[var(--secondary)]">{LETTERS[ci]}</span>
                        <input
                          type="text"
                          value={c}
                          onChange={(e) => updateChoice(i, ci, e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                        />
                      </div>
                    ))}
                  </div>

                  <label className="mt-3 block text-xs text-[var(--secondary)]">해설 (정답: {d.answer})</label>
                  <textarea rows={2} value={d.explanation} onChange={(e) => update(i, { explanation: e.target.value })} className={inputClass} />
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
