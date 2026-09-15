"use client";

// 가입 직후 첫 로그인 시 보여주는 "관심 과목" 선택 화면(RUN_SIGNUP.md S4).
// /study/onboarding는 이미 수학 진단·배치 흐름(math-progression PG4)이 쓰고 있는 경로라
// 겹치지 않게 /onboarding/subjects로 새로 만들었다 — src/app/study/onboarding/page.tsx 참고.
//
// 여기서 고르는 건 student_programs에 status='interested'로만 남는 "관심 표시"다.
// 실제 수강 권한이 아니다 — 접근권은 entitlement_grants로만 판정하고(이번 단계에서
// 새로 만들지 않음), 여기서는 헤더 메뉴 노출과 "수강 신청 안내" 문구에만 쓰인다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROGRAM_LABELS, type StudentProgram } from "@/lib/programs";

const PROGRAM_DESC: Record<StudentProgram, string> = {
  math: "초등부터 AS·A Level까지, 커리큘럼별 개념·문제풀이",
  sat: "Digital SAT 대비 문제 은행",
  toefl: "2026 개편 포맷 TOEFL 실전 연습",
};

export default function SubjectOnboardingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<StudentProgram>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace("/login");
          return;
        }
        setToken(data.session.access_token);
      });
  }, [router]);

  function toggle(program: StudentProgram) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(program)) next.delete(program);
      else next.add(program);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      setError("관심 있는 과목을 하나 이상 골라주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/study/programs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ programs: Array.from(selected) }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "저장에 실패했습니다.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
        <h1 className="text-xl font-medium text-[var(--foreground)]">관심 과목 등록이 완료됐습니다.</h1>
        <p className="max-w-sm text-sm text-[var(--secondary)]">
          정식 수강 신청은 학원에 문의해주시면 안내해드립니다. 우선 아래에서 둘러보세요.
        </p>
        <button
          type="button"
          onClick={() => router.push("/study")}
          className="mt-4 rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          시작하기
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">관심 있는 과목을 골라주세요</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">여러 개를 고르셔도 됩니다. 나중에 바꿀 수 있어요.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {(Object.keys(PROGRAM_LABELS) as StudentProgram[]).map((program) => {
            const isSelected = selected.has(program);
            return (
              <button
                key={program}
                type="button"
                onClick={() => toggle(program)}
                className={`rounded-2xl border p-6 text-left transition-colors ${
                  isSelected ? "border-[var(--pink)] bg-[var(--mint)]" : "border-[var(--border-c)] bg-white"
                }`}
              >
                <p className="text-lg font-bold text-[var(--foreground)]">{PROGRAM_LABELS[program]}</p>
                <p className="mt-1 text-xs text-[var(--secondary)]">{PROGRAM_DESC[program]}</p>
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !token}
          className="mt-8 rounded-full bg-[var(--pink)] px-10 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
        >
          {loading ? "저장 중..." : "선택 완료"}
        </button>
      </div>
    </main>
  );
}
