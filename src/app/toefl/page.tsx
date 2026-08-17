"use client";

// TOEFL 대시보드(최소 버전). spec §10 app/toefl/page.tsx.
// 4개 영역 개별 연습 전부 완료(P5 풀 모의고사 통합 전) — 응시 이력·밴드 추이는 아직 없음(P5).
// 학생 응시 화면은 spec §14대로 영어를 쓴다.

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
  const SECTIONS = [
    { key: "reading", label: "Start Reading" },
    { key: "listening", label: "Start Listening" },
    { key: "speaking", label: "Start Speaking" },
    { key: "writing", label: "Start Writing" },
  ] as const;

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

  async function startSection(formId: string, section: "reading" | "listening" | "speaking" | "writing") {
    setError(null);
    const key = `${formId}:${section}`;
    setStarting(key);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ form_id: formId, mode: "section_practice", section }),
    });
    const data = await res.json();
    setStarting(null);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "Failed to start the test.");
      return;
    }
    router.push(`/toefl/test/${data.attempt_id}/${section}`);
  }

  // 풀 모의고사(mode='full')는 항상 reading부터 시작한다(§2 고정 순서). 이후 각 영역 화면이
  // 다음 영역 시작(sections/:s/start)으로 이어 붙인다.
  async function startFull(formId: string) {
    setError(null);
    const key = `${formId}:full`;
    setStarting(key);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ form_id: formId, mode: "full" }),
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
    <main data-theme="en" className="min-h-screen bg-[var(--background)] mx-auto max-w-3xl px-6 py-16">
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => startFull(f.id)}
                  disabled={starting === `${f.id}:full`}
                  className="rounded-full bg-[var(--mint-dark)] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {starting === `${f.id}:full` ? "Starting..." : "Start Full Mock Test (90 min)"}
                </button>
                {SECTIONS.map((s) => {
                  const key = `${f.id}:${s.key}`;
                  return (
                    <button
                      key={s.key}
                      onClick={() => startSection(f.id, s.key)}
                      disabled={starting === key}
                      className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
                    >
                      {starting === key ? "Starting..." : s.label}
                    </button>
                  );
                })}
              </div>
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
