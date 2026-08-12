"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile, PurchasedCourse } from "@/lib/profile";
import { isStaff } from "@/lib/roles";
import { useLang, categoryLabel } from "@/lib/i18n";

export default function MyPage() {
  const router = useRouter();
  const { lang, t } = useLang();
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

  async function handleWithdraw() {
    if (!confirm(t("withdrawConfirm"))) return;

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setError(data.message ?? t("withdrawFailed"));
      return;
    }
    await supabase.auth.signOut();
    alert(t("withdrawDone"));
    router.replace("/");
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">{t("mypage")}</h1>
          {!loading && (
            <button
              onClick={handleLogout}
              className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
            >
              {t("logout")}
            </button>
          )}
        </div>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">{t("loading")}</p>
        ) : error ? (
          <p className="mt-10 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <section className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
              <p className="text-sm font-medium text-[var(--foreground)]">{t("myInfo")}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="w-20 text-[var(--secondary)]">{t("name")}</dt>
                  <dd className="text-[var(--foreground)]">{profile?.name ?? "-"}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-20 text-[var(--secondary)]">{t("email")}</dt>
                  <dd className="text-[var(--foreground)]">{profile?.email ?? "-"}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/worksheets"
                  className="inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
                >
                  {t("myWorksheets")}
                </Link>
                <Link
                  href="/vocab"
                  className="inline-block rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  단어 학습
                </Link>
                {isStaff(profile?.role) && (
                  <Link
                    href="/admin"
                    className="inline-block rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                  >
                    {t("adminPanel")}
                  </Link>
                )}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-[var(--foreground)]">{t("myCourses")}</h2>

              {purchases.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
                  <p className="text-sm text-[var(--secondary)]">{t("noCourses")}</p>
                  <Link
                    href="/courses"
                    className="mt-5 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
                  >
                    {t("browse")}
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
                        <div className="flex items-center gap-2">
                          <span className="inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
                            {item.course ? categoryLabel(item.course.category, lang) : "-"}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              item.status === "paid"
                                ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                                : "bg-[var(--border-c)] text-[var(--secondary)]"
                            }`}
                          >
                            {item.status === "paid" ? t("enrolled") : t("enrollPending")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                          {item.course?.title ?? "삭제된 강좌"}
                        </p>
                      </div>
                      {item.course && item.status === "paid" && (
                        <Link
                          href={`/courses/${item.course.slug}/learn`}
                          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
                        >
                          {t("goWatch")}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-14 border-t border-[var(--border-c)] pt-8">
              <h2 className="text-sm font-medium text-[var(--secondary)]">
                {t("dangerZone")}
              </h2>
              <button
                onClick={handleWithdraw}
                className="mt-3 text-sm text-red-600 underline hover:text-red-700"
              >
                {t("withdraw")}
              </button>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
