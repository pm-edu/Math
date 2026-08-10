"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Problem } from "@/lib/problems";

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
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }

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
      setLoading(false);
    }
    load();
  }, [id, router]);

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
              {problems.some((p) => p.answer) && (
                <button
                  onClick={() => setShowAnswers((v) => !v)}
                  className="rounded-full border border-[var(--border-c)] bg-white px-4 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--mint)]/40"
                >
                  {showAnswers ? "정답 숨기기" : "정답 확인"}
                </button>
              )}
            </div>

            {problems.length === 0 ? (
              <p className="mt-10 text-sm text-[var(--secondary)]">문제가 없습니다.</p>
            ) : (
              <ol className="mt-8 space-y-8">
                {problems.map((p, i) => (
                  <li key={p.id}>
                    <p className="mb-2 text-sm font-medium text-[var(--secondary)]">{i + 1}번</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.image_url} alt={`${i + 1}번 문제`} className="w-full rounded-xl border border-[var(--border-c)]" />
                    {showAnswers && p.answer && (
                      <p className="mt-2 rounded-lg bg-[var(--mint)]/40 px-4 py-2 text-sm text-[var(--foreground)]">
                        정답: {p.answer}
                      </p>
                    )}
                    {showAnswers && p.solution_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.solution_image_url} alt={`${i + 1}번 해설`} className="mt-2 w-full rounded-xl border border-[var(--border-c)]" />
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
