"use client";

// TOEFL 종합 리포트. docs/toefl-spec.md §7("총점: 4개 영역 scaled 합 = 0–120, 밴드 평균을
// 0.5 단위 반올림 = 종합 밴드. 리포트에는 셋 다 표시"), §9(GET /report), §10.
// section_practice(단일 영역)든 full(4영역)이든 이 페이지 하나로 보여준다 — 영역이 1개면
// 종합 점수가 그 영역 점수와 같아질 뿐, 별도 분기 없이 자연히 동작한다.
// API 라우트 대신 이 페이지가 RLS로 직접 조회한다(own attempt/section_attempt는 학생 본인
// 조회가 이미 허용돼 있어서 — worksheets 페이지 등 이 프로젝트의 기존 관례와 동일).

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bandToCefr } from "@/lib/toefl/scoring";
import { SECTION_ORDER } from "@/lib/toefl/section-order";
import type { ToeflSection } from "@/lib/toefl/types";

type SectionRow = {
  section: ToeflSection;
  raw_score: number | null;
  scaled_score: number | null;
  band: number | null;
  finished_at: string | null;
};

const SECTION_LABEL: Record<ToeflSection, string> = {
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
};

export default function ToeflReportPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: attempt } = await supabase
        .from("toefl_attempt")
        .select("id, mode")
        .eq("id", attemptId)
        .maybeSingle();
      if (!attempt) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setMode(attempt.mode);

      const { data: rows } = await supabase
        .from("toefl_section_attempt")
        .select("section, raw_score, scaled_score, band, finished_at")
        .eq("attempt_id", attemptId);

      const ordered = [...(rows ?? [])].sort(
        (a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
      );
      setSections(ordered);
      setLoading(false);
    }
    load();
  }, [attemptId, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--secondary)]">Loading...</p>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-600">Report not found.</p>
        <button onClick={() => router.push("/toefl")} className="text-sm text-[var(--secondary)] underline">
          ← Back to TOEFL home
        </button>
      </main>
    );
  }

  const finishedSections = sections.filter((s) => s.finished_at);
  const allDone = finishedSections.length === sections.length && sections.length > 0;
  const totalScaled = finishedSections.reduce((sum, s) => sum + (s.scaled_score ?? 0), 0);
  const avgBand =
    finishedSections.length > 0
      ? finishedSections.reduce((sum, s) => sum + Number(s.band ?? 0), 0) / finishedSections.length
      : 0;
  const overallBand = Math.round(avgBand * 2) / 2;
  const cefr = bandToCefr(overallBand);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-medium text-[var(--foreground)]">TOEFL Report</h1>
      <p className="mt-1 text-sm text-[var(--secondary)]">{mode === "full" ? "Full practice test" : "Section practice"}</p>

      {!allDone && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Not every section is finished yet — this report only reflects completed sections.
        </p>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--border-c)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--mint)]/20 text-left text-[var(--secondary)]">
            <tr>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Scaled (0–30)</th>
              <th className="px-4 py-2 font-medium">Band</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.section} className="border-t border-[var(--border-c)]">
                <td className="px-4 py-2 text-[var(--foreground)]">{SECTION_LABEL[s.section]}</td>
                <td className="px-4 py-2 text-[var(--foreground)]">
                  {s.finished_at ? (s.scaled_score ?? "—") : "not taken"}
                </td>
                <td className="px-4 py-2 text-[var(--foreground)]">{s.finished_at ? (s.band ?? "—") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/30 px-6 py-6 text-center">
        <p className="text-sm text-[var(--secondary)]">Overall band</p>
        <p className="text-4xl font-bold text-[var(--mint-dark)]">{overallBand || "—"}</p>
        <p className="mt-1 text-xs text-[var(--secondary)]">
          Total scaled: {totalScaled} / {sections.length * 30} · CEFR: {cefr}
        </p>
      </div>

      <button
        onClick={() => router.push("/toefl")}
        className="mt-8 text-sm text-[var(--secondary)] underline"
      >
        ← Back to TOEFL home
      </button>
    </main>
  );
}
