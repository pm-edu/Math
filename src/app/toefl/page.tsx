"use client";

// TOEFL 대시보드(최소 버전). spec §10 app/toefl/page.tsx.
// P1 범위: 응시 이력·밴드 추이는 아직 없음(P5) — 공개된 폼 목록에서 Reading 연습을 시작하는
// 진입점만 제공한다. 학생 응시 화면은 spec §14대로 영어를 쓴다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ToeflForm = { id: string; code: string; title: string };

export default function ToeflDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<ToeflForm[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data } = await supabase
        .from("toefl_form")
        .select("id, code, title")
        .eq("is_published", true)
        .order("created_at");
      setForms(data ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function startReading(formId: string) {
    setError(null);
    setStarting(formId);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ form_id: formId, mode: "section_practice", section: "reading" }),
    });
    const data = await res.json();
    setStarting(null);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "Failed to start the test.");
      return;
    }
    router.push(`/toefl/test/${data.attempt_id}/reading`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-medium text-[var(--foreground)]">TOEFL Practice</h1>
      <p className="mt-2 text-sm text-[var(--secondary)]">2026 format · Reading section (P1)</p>

      {loading ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">Loading...</p>
      ) : forms.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--secondary)]">No practice sets are available yet.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {forms.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4"
            >
              <div>
                <p className="font-medium text-[var(--foreground)]">{f.title}</p>
                <p className="text-xs text-[var(--secondary)]">{f.code}</p>
              </div>
              <button
                onClick={() => startReading(f.id)}
                disabled={starting === f.id}
                className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
              >
                {starting === f.id ? "Starting..." : "Start Reading"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <p className="mt-10 text-xs text-[var(--secondary)]">
        TOEFL® is a registered trademark of ETS. This service is not endorsed or affiliated with ETS.
      </p>
    </main>
  );
}
