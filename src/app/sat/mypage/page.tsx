"use client";

// SAT 마이페이지 — 지금은 최소 스켈레톤. 모의고사 응시 기록(toefl/mypage의 이어하기/폐기 같은
// 기능)은 실제 응시 흐름이 아직 없어서(관리자 화면 단계 이후) 다음에 채운다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SatHeader from "@/components/sat/SatHeader";
import { createClient } from "@/lib/supabase/client";

export default function SatMyPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?sat=1");
        return;
      }
      setEmail(data.user.email ?? null);
    });
  }, [router]);

  if (!email) return null;

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--en-paper)]">
      <SatHeader />
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-extrabold text-[var(--en-ink)]">마이페이지</h1>
        <p className="mt-2 text-sm text-[var(--en-ink-soft)]">{email}</p>
        <p className="mt-6 text-sm text-[var(--en-ink-soft)]">
          모의고사 응시 기록 기능은 준비 중입니다. 지금은{" "}
          <Link href="/sat" className="underline hover:text-[var(--en-ink)]">
            유형별 연습
          </Link>
          을 이용해주세요.
        </p>
      </main>
    </div>
  );
}
