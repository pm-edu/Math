"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Listening 노트테이킹 패널(요청: 우측, 접기 가능, attempt에 저장하되 채점 대상 아님).
// 문항이 아니라 섹션 전체에 걸친 메모라 attemptId+section 단위로 읽고 쓴다(별도 notes
// 라우트, current 라우트와는 분리 — 그 라우트의 주석 참고). 답안 자동저장과 같은 패턴
// (3초 debounce)이지만 실패해도 조용히 넘어간다 — 채점에 영향이 없어서.

export default function NotesPanel({ attemptId, section }: { attemptId: string; section: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef<string | null>(null);

  async function authHeaders() {
    if (!tokenRef.current) {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      tokenRef.current = data.session?.access_token ?? null;
    }
    return { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await authHeaders();
      const res = await fetch(`/api/toefl/attempts/${attemptId}/sections/${section}/notes`, { headers });
      const data = await res.json().catch(() => null);
      if (!cancelled && data?.ok) setNotes(data.notes ?? "");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, section]);

  function handleChange(value: string) {
    setNotes(value);
    setSaveState("idle");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveState("saving");
      const headers = await authHeaders();
      await fetch(`/api/toefl/attempts/${attemptId}/sections/${section}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ notes: value }),
      }).catch(() => {});
      setSaveState("saved");
    }, 3000);
  }

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-[var(--secondary)]"
      >
        <span>📝 Notes {saveState === "saving" ? "· saving…" : saveState === "saved" ? "· saved" : ""}</span>
        <span>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4">
          <textarea
            value={notes}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Jot down what you hear — not graded, just for you."
            rows={10}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full resize-none rounded-lg border border-[var(--border-c)] bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--foreground)] outline-none focus:border-[var(--pink)]"
          />
        </div>
      )}
    </div>
  );
}
