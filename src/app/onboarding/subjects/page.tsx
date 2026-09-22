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
  english: "간격 반복으로 단어를 잊지 않게 관리하는 완전학습",
};

// "수학"을 고르면 여기서 바로 커리큘럼까지 같이 받는다(2026-09-22 지시 — 관심 과목 고르고
// 나서 또 /study/onboarding으로 한 번 더 거치는 게 불필요한 단계라 한 화면으로 합침).
// 구조: "한국 교육과정"(단일) / "INTERNATIONAL"(펼치면 IB/IGCSE/CBSE/AS·A Level, 각각 체크박스).
// IB/CBSE/AS·A Level은 아직 트랙이 없어 골라도 /study에서 "준비 중" 안내만 뜨지만, 사용자
// 지시로 선택지 자체는 다 보여준다(2026-09-22).
const INTERNATIONAL_OPTIONS: { value: string; label: string }[] = [
  { value: "IB", label: "IB" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "CBSE", label: "CBSE" },
  { value: "AS_A_Level", label: "AS·A Level" },
];

// "시작하기"가 어디로 갈지 — 고른 과목마다 이미 독립 서브도메인이 있다
// (math.pmedu4u.com/toefl.pmedu4u.com/sat.pmedu4u.com/english.pmedu4u.com). 골랐으면
// 그 서브도메인으로 아예 넘긴다(2026-09-22 지시 — "수학을 선택하면 수학사이트로,
// 영어를 선택하면 영어사이트로, 독립된 것처럼"). 이미 그 호스트에 있으면 상대경로만.
// 로그인 세션은 .pmedu4u.com 공유 쿠키라(src/lib/cookie-domain.ts) 재로그인 없이 넘어간다.
// 여러 개를 골랐으면 이 순서로 우선순위(math가 가장 먼저 — 기존 수학 온보딩 흐름이 이미
// 있어서), 아무 것도 안 맞으면(선택한 게 없거나 매핑 안 된 과목) 마이페이지로.
const SUBJECT_HOSTS: Record<StudentProgram, { host: string; path: string }> = {
  math: { host: "math.pmedu4u.com", path: "/study" },
  toefl: { host: "toefl.pmedu4u.com", path: "/toefl" },
  sat: { host: "sat.pmedu4u.com", path: "/sat" },
  english: { host: "english.pmedu4u.com", path: "/english" },
};
const PRIORITY_ORDER: StudentProgram[] = ["math", "toefl", "sat", "english"];

function primaryDestination(selected: Set<StudentProgram>): string {
  const program = PRIORITY_ORDER.find((p) => selected.has(p));
  if (!program) return "/mypage";
  const { host, path } = SUBJECT_HOSTS[program];
  const isOnThatHost = typeof window !== "undefined" && window.location.hostname === host;
  return isOnThatHost ? path : `https://${host}${path}`;
}

export default function SubjectOnboardingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<StudentProgram>>(new Set());
  const [curriculumGroup, setCurriculumGroup] = useState<string | null>(null);
  const [internationalOpen, setInternationalOpen] = useState(false);
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
      if (next.has(program)) {
        next.delete(program);
        if (program === "math") {
          setCurriculumGroup(null);
          setInternationalOpen(false);
        }
      } else {
        next.add(program);
      }
      return next;
    });
  }

  const needsCurriculum = selected.has("math");

  async function handleSubmit() {
    if (selected.size === 0) {
      setError("관심 있는 과목을 하나 이상 골라주세요.");
      return;
    }
    if (needsCurriculum && !curriculumGroup) {
      setError("어느 교육과정으로 수학을 공부하는지 골라주세요.");
      return;
    }
    setLoading(true);
    setError(null);

    if (needsCurriculum && curriculumGroup) {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ curriculum_group: curriculumGroup })
          .eq("id", auth.user.id);
        if (updateError) {
          setLoading(false);
          setError("커리큘럼 저장에 실패했습니다. 다시 시도해주세요.");
          return;
        }
      }
    }

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
          onClick={() => {
            const dest = primaryDestination(selected);
            if (dest.startsWith("http")) window.location.href = dest;
            else router.push(dest);
          }}
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

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {needsCurriculum && (
          <div className="mt-8 text-left">
            <h2 className="text-center text-sm font-medium text-[var(--foreground)]">수학은 어느 교육과정으로 공부하나요?</h2>
            <div className="mx-auto mt-3 grid max-w-md gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setCurriculumGroup("KR");
                  setInternationalOpen(false);
                }}
                className={`rounded-2xl border p-4 transition-colors ${
                  curriculumGroup === "KR" ? "border-[var(--pink)] bg-[var(--mint)]" : "border-[var(--border-c)] bg-white"
                }`}
              >
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={curriculumGroup === "KR"} readOnly className="h-4 w-4 accent-[var(--pink)]" />
                  <span className="text-sm font-bold text-[var(--foreground)]">한국 교육과정</span>
                </label>
              </button>

              <button
                type="button"
                onClick={() => setInternationalOpen((o) => !o)}
                className={`rounded-2xl border p-4 transition-colors ${
                  internationalOpen || INTERNATIONAL_OPTIONS.some((o) => o.value === curriculumGroup)
                    ? "border-[var(--pink)] bg-[var(--mint)]"
                    : "border-[var(--border-c)] bg-white"
                }`}
              >
                <span className="text-sm font-bold text-[var(--foreground)]">INTERNATIONAL</span>
              </button>
            </div>

            {internationalOpen && (
              <div className="mx-auto mt-3 grid max-w-md gap-2 sm:grid-cols-2">
                {INTERNATIONAL_OPTIONS.map((c) => {
                  const isSelected = curriculumGroup === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCurriculumGroup(c.value)}
                      className={`rounded-xl border p-3 transition-colors ${
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
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !token || (needsCurriculum && !curriculumGroup)}
          className="mt-8 rounded-full bg-[var(--pink)] px-10 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
        >
          {loading ? "저장 중..." : "선택 완료"}
        </button>
      </div>
    </main>
  );
}
