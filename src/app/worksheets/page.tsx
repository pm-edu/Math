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
        .select("worksheet:worksheets(id, title, description, subject, created_at)")
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
        className="mx-auto max-w-3xl bg-[var(--background)] px-6 py-16"
      >
        <h1 className="text-3xl font-medium text-[var(--foreground)]">내 학습지</h1>
        <p className="mt-2 text-[var(--secondary)]">선생님이 배포한 문제지입니다.</p>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : worksheets.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-12 text-center">
            <p className="text-[var(--foreground)]">아직 받은 학습지가 없습니다.</p>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {worksheets.map((w) => (
              <li key={w.id}>
                <Link
                  href={`/worksheets/${w.id}`}
                  className="block rounded-2xl border border-[var(--border-c)] bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <p className="text-sm font-medium text-[var(--foreground)]">{w.title}</p>
                  {w.description && (
                    <p className="mt-1 text-sm text-[var(--secondary)]">{w.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
