import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Price from "@/components/Price";
import { T, CategoryLabel, L } from "@/components/T";
import { getCourses } from "@/lib/courses";
import { getSubject } from "@/lib/subject-server";

// DB에서 강좌를 수정하면 최대 1분 뒤 사이트에 반영된다.
export const revalidate = 60;

export default async function CoursesPage() {
  const subject = await getSubject();
  const courses = await getCourses(subject);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-en-paper">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h1 className="text-3xl font-bold text-en-ink">
            <T k="coursesTitle" />
          </h1>
          <p className="mt-2 text-en-ink-soft">
            <T k="coursesSubtitle" />
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {courses.map((course) => (
              <Link
                key={course.slug}
                href={`/courses/${course.slug}`}
                className="rounded-2xl border border-en-line bg-en-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="inline-block rounded-full bg-en-gold-soft px-3 py-1 text-xs font-bold text-en-gold-deep">
                  <CategoryLabel value={course.category} />
                </span>
                <h2 className="mt-4 text-lg font-bold text-en-ink">
                  <L ko={course.title} en={course.title_en} />
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-en-ink-soft">
                  <L ko={course.description} en={course.description_en} />
                </p>
                <p className="mt-4 text-base font-bold text-en-ink">
                  <Price krw={course.price} inr={course.price_inr} />
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
