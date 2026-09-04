"use client";

// SAT 유형별 연습. src/app/toefl/practice/[type]/page.tsx와 같은 역할 —
// sat_questions_public 뷰(정답 미노출)에서 스킬로 문항 하나를 무작위로 골라 보여준다.
// 지금은 로그인 사용자만 지원한다(src/lib/sat/server/auth.ts 참고).

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SatHeader from "@/components/sat/SatHeader";
import SatQuestionCard, { type SatPublicQuestion } from "@/components/sat/SatQuestionCard";
import { createClient } from "@/lib/supabase/client";
import { SAT_SKILLS, skillLabelKo, type SatSkill } from "@/lib/sat/taxonomy";

const SKILL_KEYS: Set<string> = new Set(SAT_SKILLS.map((s) => s.key));

export default function SatPracticePage({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = usePromise(params);
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [question, setQuestion] = useState<SatPublicQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [noQuestions, setNoQuestions] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?sat=1");
        return;
      }
      setLoggedIn(true);
    });
  }, [router]);

  useEffect(() => {
    if (!loggedIn || !SKILL_KEYS.has(skill)) return;
    setLoading(true);
    setNoQuestions(false);
    setQuestion(null);

    const supabase = createClient();
    supabase
      .from("sat_questions_public")
      .select("id, section, domain, skill, difficulty, format, prompt, payload")
      .eq("skill", skill)
      .limit(20)
      .then(({ data }) => {
        if (!data || data.length === 0) {
          setNoQuestions(true);
          setLoading(false);
          return;
        }
        const pick = data[Math.floor(Math.random() * data.length)] as SatPublicQuestion;
        setQuestion(pick);
        setLoading(false);
      });
  }, [loggedIn, skill, reloadKey]);

  if (!SKILL_KEYS.has(skill)) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <SatHeader />
        <main className="mx-auto max-w-xl px-6 py-16 text-center text-sm text-[var(--secondary)]">
          존재하지 않는 스킬입니다. <Link href="/sat" className="underline">SAT 메인으로</Link>
        </main>
      </div>
    );
  }

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--en-paper)]">
      <SatHeader />
      <main className="mx-auto max-w-xl px-6 py-10">
        <p className="text-sm text-[var(--en-ink-soft)]">
          <Link href="/sat" className="underline hover:text-[var(--en-ink)]">
            SAT 메인
          </Link>
        </p>
        <h1 className="mt-2 text-xl font-extrabold text-[var(--en-ink)]">{skillLabelKo(skill as SatSkill)} 연습</h1>

        <div className="mt-6">
          {loading && <p className="text-sm text-[var(--en-ink-soft)]">문항을 불러오는 중…</p>}
          {noQuestions && (
            <p className="text-sm text-[var(--en-ink-soft)]">
              아직 이 유형에 검수된 문항이 없습니다. 다른 유형을 시도해보세요.
            </p>
          )}
          {question && (
            <>
              <SatQuestionCard key={question.id} question={question} />
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-4 rounded-full border border-[var(--en-line)] bg-white px-5 py-2 text-sm font-semibold text-[var(--en-ink)] hover:bg-[#F7F8FA]"
              >
                다음 문제
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
