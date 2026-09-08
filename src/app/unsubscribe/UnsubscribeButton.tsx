"use client";

import { useState } from "react";

export default function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setState("loading");
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setState("error");
      setMessage(data.message ?? "처리에 실패했습니다.");
      return;
    }
    setState("done");
  }

  if (state === "done") {
    return <p className="mt-6 text-sm font-semibold text-en-ink">수신거부가 완료되었습니다. 더 이상 메일을 보내드리지 않습니다.</p>;
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-[11px] bg-en-gold px-6 py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
      >
        {state === "loading" ? "처리 중..." : "구독 해지하기"}
      </button>
      {state === "error" && <p className="mt-3 text-sm text-red-600">{message}</p>}
    </div>
  );
}
