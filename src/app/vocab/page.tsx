"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

// v1(Leitner) 단어 학습은 완전학습 엔진(v2)으로 교체 중이다. Stage 3에서 이 화면을
// 새 세션 플레이어로 다시 만든다. 그 전까지는 옛 테이블(words/word_progress 등,
// Stage 1에서 제거됨)을 더 이상 참조하지 않도록 안내 화면만 둔다.
export default function VocabPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setChecked(true);
    });
  }, [router]);

  if (!checked) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-sm text-[var(--secondary)]">확인 중...</p></main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">단어 학습 준비 중</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">
          더 제대로 외워지도록 완전학습 방식으로 새로 만들고 있습니다. 곧 다시 열립니다.
        </p>
        <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          마이페이지로
        </Link>
      </main>
      <Footer />
    </>
  );
}
