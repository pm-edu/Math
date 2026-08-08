"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile, PurchasedCourse } from "@/lib/profile";

export default function MyPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [purchases, setPurchases] = useState<PurchasedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const [profileResult, purchaseResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase
          .from("purchases")
          .select("id, status, purchased_at, course:courses(slug, title, category, price)")
          .eq("user_id", auth.user.id)
          .order("purchased_at", { ascending: false }),
      ]);

      if (profileResult.error) {
        setError("프로필을 불러오지 못했습니다.");
      } else {
        setProfile(profileResult.data as Profile | null);
      }
      if (!purchaseResult.error) {
        setPurchases((purchaseResult.data ?? []) as unknown as PurchasedCourse[]);
      }
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.replace("/");
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">마이페이지</h1>
          {!loading && (
            <button
              onClick={handleLogout}
              className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
            >
              로그아웃
            </button>
          )}
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : error ? (
          <p className="mt-10 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
              <p className="text-sm font-medium text-[var(--foreground)]">내 정보</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="w-20 text-[var(--secondary)]">이름</dt>
                  <dd className="text-[var(--foreground)]">{profile?.name ?? "-"}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-20 text-[var(--secondary)]">이메일</dt>
                  <dd className="text-[var(--foreground)]">{profile?.email ?? "-"}</dd>
                </div>
              </dl>

              {profile?.role === "admin" && (
                <Link
                  href="/admin"
                  className="mt-6 inline-block rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  학생 관리 화면으로
                </Link>
              )}
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-[var(--foreground)]">내 강좌</h2>

              {purchases.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
                  <p className="text-sm text-[var(--secondary)]">
                    아직 수강 중인 강좌가 없습니다.
                  </p>
                  <Link
                    href="/courses"
                    className="mt-5 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
                  >
                    강좌 둘러보기
                  </Link>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {purchases.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--border-c)] bg-white p-5"
                    >
                      <div>
                        <span className="inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
                          {item.course?.category ?? "-"}
                        </span>
                        <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                          {item.course?.title ?? "삭제된 강좌"}
                        </p>
                      </div>
                      {item.course && (
                        <Link
                          href={`/courses/${item.course.slug}`}
                          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
                        >
                          보러 가기
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
