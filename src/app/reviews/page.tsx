import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { T } from "@/components/T";
import { createPublicClient } from "@/lib/supabase/server";

export const revalidate = 60;

type ReviewRow = {
  id: string;
  content: string;
  rating: number | null;
  created_at: string;
  course: { title: string } | null;
};

async function getReviews(): Promise<ReviewRow[]> {
  const { data, error } = await createPublicClient()
    .from("reviews")
    .select("id, content, rating, created_at, course:courses(title)")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as unknown as ReviewRow[];
}

export default async function ReviewsPage() {
  const reviews = await getReviews();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">
          <T k="reviewsTitle" />
        </h1>
        <p className="mt-2 text-[var(--secondary)]">
          <T k="reviewsSubtitle" />
        </p>

        {reviews.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-12 text-center">
            <p className="text-[var(--foreground)]">
              <T k="noReviews" />
            </p>
            <p className="mt-2 text-sm text-[var(--secondary)]">
              <T k="noReviewsSub" />
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
            >
              <T k="browse" />
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-2xl border border-[var(--border-c)] bg-white p-6"
              >
                {review.rating !== null && (
                  <p className="text-sm text-[var(--pink-dark)]">
                    {"★".repeat(review.rating)}
                    <span className="text-[var(--border-c)]">
                      {"★".repeat(5 - review.rating)}
                    </span>
                  </p>
                )}
                <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]">
                  &ldquo;{review.content}&rdquo;
                </p>
                <p className="mt-4 text-xs text-[var(--secondary)]">
                  <T k="student" />
                  {review.course ? ` · ${review.course.title}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
