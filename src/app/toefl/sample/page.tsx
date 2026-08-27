"use client";

// TOEFL 문항 미리보기(2026-08-18) — 인증 없이 누구나 볼 수 있는 샘플 화면.
// docs/toefl-spec.md §14: 학생 응시 화면은 영어만 쓴다(이 화면도 마찬가지).
// 진짜 응시(타이머·자동저장·채점)는 전혀 없다 — 그냥 인터페이스 느낌만 보여주는 용도라
// TaskRenderer에 로컬 state만 연결하고 어디에도 저장하지 않는다. /api/toefl/sample이
// answer_key 없는 안전한 필드만 내려주므로 정답 노출 걱정도 없다.
// 언어 토글(2026-08-18) 적용 대상에서 제외 — 위 §14 결정("이 화면도 영어만")이 여전히 유효해서
// ToeflHeader에 showLanguageToggle={false}만 넘긴다(그 외 이 파일은 안 건드림).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TaskRenderer from "@/components/toefl/TaskRenderer";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { createClient } from "@/lib/supabase/client";
import { SECTION_DESCRIPTION } from "@/lib/toefl/section-order";
import type { ToeflItemPublic } from "@/lib/toefl/types";

export default function ToeflSamplePage() {
  const router = useRouter();
  const [items, setItems] = useState<ToeflItemPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  // 3차 화면 검토(2026-08-27) [C]-9: 하단 버튼이 로그인 여부에 따라 다른 곳으로 가야 해서만
  // 로그인 상태를 확인한다 — 이 화면 자체는 여전히 인증 없이 전부 볼 수 있다(위 주석 그대로).
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setLoggedIn(!!data.user));
  }, []);

  // fetch 실패(네트워크 오류·5xx 등)를 안 잡으면 화면이 "Loading..."에서 영원히 멈춘다
  // (writing/speaking 응시화면에서 겪은 것과 같은 실수를 반복하지 않는다).
  useEffect(() => {
    fetch("/api/toefl/sample")
      .then((res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        return res.json();
      })
      .then((data) => setItems(data.items ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader showLanguageToggle={false} />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">Try a few sample questions</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          Just a preview — nothing here is saved or scored. Sign up to take the full, timed test.
        </p>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">Loading...</p>
        ) : loadError ? (
          <p className="mt-10 text-sm text-red-600">Couldn't load sample questions. Please try again shortly.</p>
        ) : (
          <div className="mt-8 space-y-5">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--pink-dark)]">
                  {item.task_type.replace(/_/g, " ")}
                </p>
                <TaskRenderer
                  item={item}
                  attemptId="sample"
                  value={answers[item.id]}
                  onChange={(answer) => setAnswers((prev) => ({ ...prev, [item.id]: answer }))}
                />
              </div>
            ))}

            {(["listening", "speaking"] as const).map((section) => (
              <div
                key={section}
                className="rounded-2xl border border-dashed border-[var(--border-c)] bg-[var(--background)] p-5 text-center"
              >
                <p className="text-sm font-semibold text-[var(--foreground)] capitalize">🔒 {section}</p>
                <p className="mt-1 text-xs text-[var(--secondary)]">{SECTION_DESCRIPTION[section]}</p>
                <p className="mt-1 text-xs text-[var(--secondary)]">Sign up to unlock audio and recording questions.</p>
              </div>
            ))}

            {/* 화면 검토(2026-08-27) [C]: 마지막(유일한 텍스트) 문항까지 답해봤으면 완료
                요약을 보여준다 — 진짜 채점은 없으니(안내문 그대로) 결과 대신 "다음엔 뭘 하면
                되는지"로 마무리한다. */}
            {items.length > 0 && items.every((it) => it.id in answers) && (
              <div className="rounded-2xl border border-[var(--mint-dark)]/30 bg-[var(--mint)]/20 p-5 text-center">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  Nice — you just tried {items.length} sample question{items.length > 1 ? "s" : ""}.
                </p>
                <p className="mt-1 text-xs text-[var(--secondary)]">
                  The real test includes Reading, Listening, Speaking, and Writing — with real timing and scoring.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--border-c)] pt-8 text-center">
          <button
            onClick={() => router.push("/signup?toefl=1")}
            className="rounded-full bg-[var(--pink-dark)] px-6 py-3 text-sm font-semibold text-white"
          >
            Sign up to take the full test →
          </button>
          <button
            onClick={() => router.push(loggedIn ? "/toefl/start" : "/signup?toefl=1")}
            className="text-sm text-[var(--secondary)] underline"
          >
            Start TOEFL
          </button>
        </div>
      </main>
    </div>
  );
}
