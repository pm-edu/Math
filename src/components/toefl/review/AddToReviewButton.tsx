"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { interpolate, useLang } from "@/lib/i18n";

// 오답 문항에 연결된 단어를 기존 FSRS 복습 큐(user_word_states, [[english-mastery-learning-subsystem]]
// 이 쓰는 그 테이블)로 보낸다. spec §13: "기존 스케줄러 재사용, 신규 구현 금지" — 그래서 새 테이블/
// API를 안 만들고, 그 테이블이 이미 쓰는 신호(due_at <= now() = "복습 대상", src/lib/english/
// session-data.ts:158 확인함)를 그대로 이용한다. user_word_states RLS가 본인 행 upsert를 이미
// 허용해서(students manage own word_states) 클라이언트에서 직접 쓴다 — 서버 라우트 불필요.
// upsert는 word_id+user_id 충돌 시 due_at만 갱신하고 level/stability/difficulty(기존 학습 진도)는
// 절대 건드리지 않는다 — payload에 그 컬럼들을 아예 안 넣으면 ON CONFLICT DO UPDATE가 넘긴
// 컬럼만 덮어쓴다.

export default function AddToReviewButton({ vocabIds }: { vocabIds: string[] }) {
  const { t } = useLang();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function handleClick() {
    setState("saving");
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setState("error");
      return;
    }
    const rows = vocabIds.map((wordId) => ({ user_id: auth.user!.id, word_id: wordId, due_at: new Date().toISOString() }));
    const { error } = await supabase.from("user_word_states").upsert(rows, { onConflict: "user_id,word_id" });
    setState(error ? "error" : "done");
  }

  if (vocabIds.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "saving" || state === "done"}
        className="rounded-full border border-[var(--pink)] px-3 py-1.5 text-xs font-medium text-[var(--pink-dark)] disabled:opacity-70"
      >
        {state === "done"
          ? interpolate(t("toefl_addedToReview"), { count: vocabIds.length })
          : state === "saving"
            ? t("toefl_addingToReview")
            : interpolate(t("toefl_addToReview"), { count: vocabIds.length })}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-600">⚠ {t("toefl_addToReviewFailed")}</p>}
      {/* 2차 화면 검토(2026-08-27): 처음엔 /english/review로 보냈으나, 그 화면이 수학 사이트
          공용 Header를 쓰고 "영어 학습으로" 돌아가는 등 TOEFL 학생에게 뜬금없어 보인다는
          지적이 맞아서 /toefl/review-queue(같은 엔진, TOEFL 헤더/뒤로가기만 다른 얇은 래퍼)로
          바꿨다 — 스케줄링 로직 자체는 여전히 기존 것 그대로(spec §13). */}
      {state === "done" && (
        <Link href="/toefl/review-queue" className="ml-2 text-xs font-medium text-[var(--pink-dark)] underline">
          {t("toefl_goToReviewQueue")}
        </Link>
      )}
    </div>
  );
}
