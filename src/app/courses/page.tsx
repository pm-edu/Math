import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Price from "@/components/Price";
import { T, CategoryLabel, L } from "@/components/T";
import { getCourses } from "@/lib/courses";

// DB에서 강좌를 수정하면 최대 1분 뒤 사이트에 반영된다.
export const revalidate = 60;

export default async function CoursesPage() {
  const courses = await getCourses();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">
          <T k="coursesTitle" />
        </h1>
        <p className="mt-2 text-[var(--secondary)]">
          <T k="coursesSubtitle" />
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.slug}
              href={`/courses/${course.slug}`}
              className="rounded-2xl border border-[var(--border-c)] bg-white p-6 transition-shadow hover:shadow-md"
            >
              <span className="inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
                <CategoryLabel value={course.category} />
              </span>
              <h2 className="mt-4 text-lg font-medium text-[var(--foreground)]">
                <L ko={course.title} en={course.title_en} />
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
                <L ko={course.description} en={course.description_en} />
              </p>
              <p className="mt-4 text-base font-medium text-[var(--foreground)]">
                <Price krw={course.price} inr={course.price_inr} />
              </p>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
