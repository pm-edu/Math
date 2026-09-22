"use client";

// math.pmedu4u.com 전용 온보딩 — curriculum_group이 없는 학생에게 어느 교육과정을 공부하는지
// 물어서 profiles.curriculum_group을 채운다. 루트 도메인의 /onboarding/subjects(과목 관심
// 표시, RUN_SIGNUP.md S4)는 student_programs만 채우고 curriculum_group은 안 건드려서, math
// 호스트에서는 그리로 보내면 /study ↔ 거기 사이를 못 빠져나가는 막다른 길이 됐다
// (2026-09-18 실사용 중 발견 — src/app/study/page.tsx가 호스트별로 갈라 보낸다).
//
// 여기 오는 사람은 이미 math.pmedu4u.com에 있으므로 과목 선택 단계는 없다 — 'math' 관심만
// 자동으로 student_programs에 기록한다(기존 서비스롤 라우트 /api/study/programs 재사용,
// 새 라우트 안 만듦). curriculum_group 값 목록은 signup 페이지(CURRICULUM_OPTIONS)와 반드시
// 같아야 한다 — 유효값 집합이 거기서 정해짐.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 구조는 /onboarding/subjects(루트 도메인 관심 과목 화면)의 커리큘럼 선택과 동일하게
// 맞춘다(2026-09-22 지시 — math.pmedu4u.com도 완전히 다른 사이트처럼 보여야 함): "한국
// 교육과정"(단일) / "INTERNATIONAL"(펼치면 IB/IGCSE/CBSE/AS·A Level, 각각 체크박스).
// IB/CBSE/AS·A Level은 아직 트랙이 없어서 골라도 /study에서 "준비 중" 안내만 뜬다.
const INTERNATIONAL_OPTIONS: { value: string; label: string }[] = [
  { value: "IB", label: "IB" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "CBSE", label: "CBSE" },
  { value: "AS_A_Level", label: "AS·A Level" },
];

export default function StudyOnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [internationalOpen, setInternationalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!selected) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.replace("/login");
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ curriculum_group: selected })
      .eq("id", auth.user.id);
    if (updateError) {
      setError("저장하지 못했습니다. 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch("/api/study/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ programs: ["math"] }),
      }).catch(() => {});
    }

    router.push("/study");
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">어느 과정을 공부하나요?</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">나중에 선생님을 통해 바꿀 수 있어요.</p>

        <div className="mx-auto mt-8 grid max-w-md gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setSelected("KR");
              setInternationalOpen(false);
            }}
            className={`rounded-2xl border p-6 transition-colors ${
              selected === "KR" ? "border-[var(--pink)] bg-[var(--mint)]" : "border-[var(--border-c)] bg-white"
            }`}
          >
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected === "KR"} readOnly className="h-4 w-4 accent-[var(--pink)]" />
              <span className="text-lg font-bold text-[var(--foreground)]">한국 교육과정</span>
            </label>
          </button>

          <button
            type="button"
            onClick={() => setInternationalOpen((o) => !o)}
            className={`rounded-2xl border p-6 transition-colors ${
              internationalOpen || INTERNATIONAL_OPTIONS.some((o) => o.value === selected)
                ? "border-[var(--pink)] bg-[var(--mint)]"
                : "border-[var(--border-c)] bg-white"
            }`}
          >
            <span className="text-lg font-bold text-[var(--foreground)]">INTERNATIONAL</span>
          </button>
        </div>

        {internationalOpen && (
          <div className="mx-auto mt-4 grid max-w-md gap-3 sm:grid-cols-2">
            {INTERNATIONAL_OPTIONS.map((c) => {
              const isSelected = selected === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setSelected(c.value)}
                  className={`rounded-xl border p-4 transition-colors ${
                    isSelected ? "border-[var(--pink)] bg-[var(--mint)]" : "border-[var(--border-c)] bg-white"
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 accent-[var(--pink)]" />
                    <span className="text-sm font-bold text-[var(--foreground)]">{c.label}</span>
                  </label>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !selected}
          className={`mt-8 rounded-full px-10 py-3 text-sm font-medium transition-colors ${
            selected ? "bg-[var(--pink)] text-[var(--pink-dark)]" : "cursor-not-allowed bg-gray-200 text-gray-400"
          }`}
        >
          {loading ? "저장 중..." : "시작하기"}
        </button>
      </div>
    </main>
  );
}
