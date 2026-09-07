"use client";

// 수학 학습 진행 구조 PG6: 복습 큐 (RUN_MATH_PROGRESSION.md PG6 6-1). v_math_review_queue를
// 그대로 노출한다 — 별도 집계 없이 뷰 결과를 보여주기만 한다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

interface ReviewRow {
  unit_id: string;
  unit_name: string;
  next_review_at: string;
  mastery_score: number | null;
}

export default function StudyReviewPage() {
  const router = useRouter();
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("v_math_review_queue")
        .select("unit_id, unit_name, next_review_at, mastery_score")
        .order("next_review_at");
      setRows((data ?? []) as ReviewRow[]);
      setLoading(false);
    }
    load();
  }, [router]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("review_title")}</h1>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">{t("study_loading")}</p>
        ) : rows.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">{t("review_empty")}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((r) => (
              <li
                key={r.unit_id}
                className="flex items-center justify-between rounded-2xl border border-[var(--border-c)] bg-white p-4"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">{r.unit_name}</p>
                  <p className="mt-0.5 text-xs text-[var(--secondary)]">
                    {t("review_dueSince")} {new Date(r.next_review_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/study/${r.unit_id}?kind=review`}
                  className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
                >
                  {t("review_startButton")}
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
