"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

// v1(Leitner) 단어 관리 화면은 완전학습 엔진(v2)으로 교체 중이다. Stage 3/8에서
// 새 단어장 빌더+검수 화면으로 다시 만든다. 그 전까지는 옛 테이블(Stage 1에서 제거됨)을
// 더 이상 참조하지 않도록 안내 화면만 둔다.
export default function AdminWordsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setAllowed(canManageMaterials(me?.role));
    }
    init();
  }, [router]);

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center"><p className="text-sm text-[var(--secondary)]">확인 중...</p></main>
        <Footer />
      </>
    );
  }
  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/admin/problems" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 문제은행으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">영어 단어 (완전학습 재구축 중)</h1>
        <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-8">
          <p className="text-[var(--foreground)]">
            단어 학습을 자기보고 방식이 아니라 <b>채점 기반 완전학습</b>(인지→회상→생산→자동화 사다리 +
            90% 게이트 + 간격반복)으로 새로 설계해 만들고 있습니다.
          </p>
          <p className="mt-3 text-sm text-[var(--secondary)]">
            Stage 1(데이터 계층)까지 완료. 화면은 Stage 3/8에서 다시 열립니다.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
