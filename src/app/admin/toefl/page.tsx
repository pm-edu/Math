"use client";

// TOEFL 관리 허브. toefl.pmedu4u.com에서 TOEFL만 관리할 수 있게 만든 전용 입구다.
// 공용 /admin 허브는 미들웨어가 TOEFL 도메인에서 막으므로(src/middleware.ts의
// TOEFL_ALLOWED_PREFIXES가 "/admin/toefl"만 허용), TOEFL 사이트에서 쓸 메뉴는 여기 모은다.
// 경로는 docs/toefl-spec.md §10(app/admin/toefl/)을 그대로 따른다.
// 화면 골격(data-theme="en" 래퍼 + ToeflHeader + max-w main)은 /toefl, /toefl/mypage와 동일.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

const MENU: { href: string; label: string; description: string }[] = [
  {
    href: "/admin/toefl/items",
    label: "문항 등록",
    description: "Reading·Listening 7개 유형을 AI로 초안 생성하고, 검수한 뒤 문항 풀에 저장합니다.",
  },
  {
    href: "/admin/toefl/audio",
    label: "데모 오디오 생성",
    description: "Listening 지문·문항에 Gemini TTS로 음성을 채웁니다. 이미 있는 항목은 건너뜁니다.",
  },
];

export default function ToeflAdminHubPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      setAllowed(canManageMaterials(me?.role));
    }
    init();
  }, [router]);

  if (allowed === null) return null;

  if (!allowed) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-sm text-[var(--foreground)]">권한이 없습니다.</p>
        </main>
      </div>
    );
  }

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">TOEFL 관리</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
          이 사이트에서는 TOEFL 콘텐츠만 관리합니다. 수학·영어 강좌나 문제은행은 각 사이트의 관리
          화면에서 다룹니다.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-[var(--border-c)] bg-white px-6 py-5 transition-colors hover:border-[var(--pink)]"
            >
              <span className="text-base font-medium text-[var(--foreground)]">{item.label}</span>
              <span className="mt-1.5 block text-sm leading-relaxed text-[var(--secondary)]">
                {item.description}
              </span>
            </Link>
          ))}
        </div>

        <Link
          href="/toefl"
          className="mt-8 inline-block text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 응시 화면으로
        </Link>
      </main>
    </div>
  );
}
