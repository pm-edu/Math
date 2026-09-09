"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useSubject } from "@/lib/subject";
import type { Worksheet } from "@/lib/problems";

export default function MyWorksheetsPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const [loading, setLoading] = useState(true);
  const [allWorksheets, setAllWorksheets] = useState<Worksheet[]>([]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }

      // 나에게 배포된 문제지 (RLS가 자동으로 걸러줌)
      const { data } = await supabase
        .from("worksheet_assignments")
        .select("worksheet:worksheets(id, title, description, subject, is_exam, time_limit_minutes, created_at)")
        .order("assigned_at", { ascending: false });

      const list = (data ?? [])
        .flatMap((r) => {
          const w = (r as { worksheet: Worksheet | Worksheet[] | null }).worksheet;
          return Array.isArray(w) ? w : w ? [w] : [];
        });
      setAllWorksheets(list);
      setLoading(false);
    }
    load();
  }, [router]);

  // 헤더에서 고른 과목(수학/영어)의 학습지만 보여준다.
  const worksheets = allWorksheets.filter((w) => w.subject === subject);

  return (
    <>
      <Header />
      <main
        data-theme={subject === "english" ? "en" : undefined}
        className="min-h-screen bg-en-paper"
      >
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-bold text-en-ink">내 학습지</h1>
          <p className="mt-2 text-en-ink-soft">선생님이 배포한 문제지입니다.</p>

          {loading ? (
            <p className="mt-10 text-sm text-en-ink-soft">불러오는 중...</p>
          ) : worksheets.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-en-line bg-en-card p-12 text-center shadow-sm">
              <p className="text-en-ink">아직 받은 학습지가 없습니다.</p>
            </div>
          ) : (
            <ul className="mt-8 space-y-3">
              {worksheets.map((w) => (
                <li key={w.id}>
                  <Link
                    href={`/worksheets/${w.id}`}
                    className="block rounded-2xl border border-en-line bg-en-card p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <p className="flex items-center gap-2 text-sm font-bold text-en-ink">
                      {w.title}
                      {w.is_exam && (
                        <span className="rounded-full bg-en-gold-soft px-2.5 py-0.5 text-xs font-bold text-en-gold-deep">
                          ⏱ 실전 시험{w.time_limit_minutes ? ` · ${w.time_limit_minutes}분` : ""}
                        </span>
                      )}
                    </p>
                    {w.description && (
                      <p className="mt-1 text-sm text-en-ink-soft">{w.description}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
