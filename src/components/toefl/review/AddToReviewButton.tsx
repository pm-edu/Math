"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 오답 문항에 연결된 단어를 기존 FSRS 복습 큐(user_word_states, [[english-mastery-learning-subsystem]]
// 이 쓰는 그 테이블)로 보낸다. spec §13: "기존 스케줄러 재사용, 신규 구현 금지" — 그래서 새 테이블/
// API를 안 만들고, 그 테이블이 이미 쓰는 신호(due_at <= now() = "복습 대상", src/lib/english/
// session-data.ts:158 확인함)를 그대로 이용한다. user_word_states RLS가 본인 행 upsert를 이미
// 허용해서(students manage own word_states) 클라이언트에서 직접 쓴다 — 서버 라우트 불필요.
// upsert는 word_id+user_id 충돌 시 due_at만 갱신하고 level/stability/difficulty(기존 학습 진도)는
// 절대 건드리지 않는다 — payload에 그 컬럼들을 아예 안 넣으면 ON CONFLICT DO UPDATE가 넘긴
// 컬럼만 덮어쓴다.

export default function AddToReviewButton({ vocabIds }: { vocabIds: string[] }) {
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
          ? `✓ Added ${vocabIds.length} word${vocabIds.length > 1 ? "s" : ""} to review`
          : state === "saving"
            ? "Adding…"
            : `+ Add ${vocabIds.length} related word${vocabIds.length > 1 ? "s" : ""} to review queue`}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-600">Couldn&apos;t add to review — please try again.</p>}
    </div>
  );
}
