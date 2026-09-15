"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";
import type { TrackKey } from "@/lib/home/trackAvailability";

// 서브메뉴(학년/과정) 페이지의 "신청" 버튼 — 즉시 학습 진입이 아니라 관리자 승인 대기 상태로
// 접수된다(2026-09-15 방향 전환: 구독형 서비스는 데이터 제공이지 즉석 시험이 아니라는 지적).
// 로그인 안 된 상태로도 홈페이지에서 바로 넘어올 수 있어서, 클릭 시점에 세션이 없으면 로그인으로 보낸다.
export default function TrackInterestButton({
  trackKey,
  curriculumDetail,
  courseLabel,
}: {
  trackKey: TrackKey;
  curriculumDetail: string;
  courseLabel: string;
}) {
  const router = useRouter();
  const { t } = useLang();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleClick() {
    setState("loading");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push(`/login?next=${encodeURIComponent(`/study/track/${trackKey}/${curriculumDetail}`)}`);
      return;
    }

    try {
      const res = await fetch("/api/study/curriculum-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ trackKey, curriculumDetail }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? "failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-sm font-medium text-[var(--mint-dark)]">{t("track_interestDone")}</p>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-50"
      >
        {state === "loading" ? t("track_interestPending") : `${courseLabel} ${t("track_interestButton")}`}
      </button>
      {state === "error" && <p className="mt-2 text-sm text-red-600">{t("track_interestFailed")}</p>}
    </div>
  );
}
