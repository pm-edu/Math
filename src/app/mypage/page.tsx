"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReviewForm from "@/components/ReviewForm";
import { createClient } from "@/lib/supabase/client";
import type { Profile, PurchasedCourse } from "@/lib/profile";
import { isStaff } from "@/lib/roles";
import { useLang, categoryLabel } from "@/lib/i18n";
import { useSubject } from "@/lib/subject";

export default function MyPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const { lang, t } = useLang();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [purchases, setPurchases] = useState<PurchasedCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myReviews, setMyReviews] = useState<Map<string, { id: string; rating: number | null; content: string }>>(
    new Map()
  );
  const [openReviewFor, setOpenReviewFor] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const [profileResult, purchaseResult, reviewResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
        supabase
          .from("purchases")
          .select("id, status, purchased_at, course:courses(id, slug, title, category, price)")
          .eq("user_id", auth.user.id)
          .order("purchased_at", { ascending: false }),
        supabase.from("reviews").select("id, course_id, rating, content").eq("user_id", auth.user.id),
      ]);

      if (profileResult.error) {
        setError("프로필을 불러오지 못했습니다.");
      } else {
        setProfile(profileResult.data as Profile | null);
      }
      if (!purchaseResult.error) {
        setPurchases((purchaseResult.data ?? []) as unknown as PurchasedCourse[]);
      }
      if (!reviewResult.error) {
        const map = new Map<string, { id: string; rating: number | null; content: string }>();
        (reviewResult.data ?? []).forEach((r) => {
          map.set(r.course_id, { id: r.id, rating: r.rating, content: r.content });
        });
        setMyReviews(map);
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
      <main className="min-h-screen bg-en-paper">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-en-ink">{t("mypage")}</h1>
            {!loading && (
              <button
                onClick={handleLogout}
                className="text-sm text-en-ink-soft underline hover:text-en-ink"
              >
                {t("logout")}
              </button>
            )}
          </div>

          {loading ? (
            <p className="mt-10 text-sm text-en-ink-soft">{t("loading")}</p>
          ) : error ? (
            <p className="mt-10 text-sm text-red-600">{error}</p>
          ) : (
            <>
              <section className="mt-8 rounded-2xl border border-en-line bg-en-card p-6 shadow-sm">
                <p className="text-sm font-bold text-en-ink">{t("myInfo")}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex gap-3">
                    <dt className="w-20 text-en-ink-soft">{t("name")}</dt>
                    <dd className="text-en-ink">{profile?.name ?? "-"}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-20 text-en-ink-soft">{t("email")}</dt>
                    <dd className="text-en-ink">{profile?.email ?? "-"}</dd>
                  </div>
                </dl>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Link
                    href="/worksheets"
                    className="inline-block rounded-full bg-en-gold-soft px-5 py-2.5 text-sm font-bold text-en-gold-deep"
                  >
                    {t("myWorksheets")}
                  </Link>
                  <Link
                    href="/english"
                    className="inline-block rounded-full bg-en-gold-soft px-5 py-2.5 text-sm font-bold text-en-gold-deep"
                  >
                    영어 학습
                  </Link>
                  {isStaff(profile?.role) && (
                    <Link
                      href={subject === "math" ? "/admin/math" : "/admin"}
                      className="inline-block rounded-full bg-en-gold-soft px-5 py-2.5 text-sm font-bold text-en-gold-deep"
                    >
                      {t("adminPanel")}
                    </Link>
                  )}
                </div>
              </section>

              <section className="mt-10">
                <h2 className="text-lg font-bold text-en-ink">{t("myCourses")}</h2>

                {purchases.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-en-line bg-en-card p-8 text-center shadow-sm">
                    <p className="text-sm text-en-ink-soft">{t("noCourses")}</p>
                    <Link
                      href="/courses"
                      className="mt-5 inline-block rounded-[11px] bg-en-gold px-5 py-2.5 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep"
                    >
                      {t("browse")}
                    </Link>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {purchases.map((item) => {
                      const courseId = item.course?.id ?? null;
                      const existingReview = courseId ? myReviews.get(courseId) ?? null : null;
                      return (
                        <li key={item.id} className="rounded-2xl border border-en-line bg-en-card p-5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="inline-block rounded-full bg-en-gold-soft px-3 py-1 text-xs font-bold text-en-gold-deep">
                                  {item.course ? categoryLabel(item.course.category, lang) : "-"}
                                </span>
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                                    item.status === "paid"
                                      ? "bg-en-gold-soft text-en-gold-deep"
                                      : "bg-en-line text-en-ink-soft"
                                  }`}
                                >
                                  {item.status === "paid" ? t("enrolled") : t("enrollPending")}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-bold text-en-ink">
                                {item.course?.title ?? "삭제된 강좌"}
                              </p>
                            </div>
                            {item.course && item.status === "paid" && (
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setOpenReviewFor(openReviewFor === courseId ? null : courseId)}
                                  className="text-sm text-en-ink-soft underline hover:text-en-ink"
                                >
                                  {existingReview ? t("editReview") : t("writeReview")}
                                </button>
                                <Link
                                  href={`/courses/${item.course.slug}/learn`}
                                  className="text-sm text-en-ink-soft underline hover:text-en-ink"
                                >
                                  {t("goWatch")}
                                </Link>
                              </div>
                            )}
                          </div>

                          {courseId && openReviewFor === courseId && (
                            <ReviewForm
                              courseId={courseId}
                              userId={profile?.id ?? ""}
                              existing={existingReview}
                              onSaved={(saved) => {
                                setMyReviews((prev) => new Map(prev).set(courseId, saved));
                                setOpenReviewFor(null);
                              }}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="mt-14 border-t border-en-line pt-8">
                <h2 className="text-sm font-medium text-en-ink-soft">
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
        </div>
      </main>
      <Footer />
    </>
  );
}
