import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getCourses } from "@/lib/courses";

// DB에서 강좌를 수정하면 최대 1분 뒤 사이트에 반영된다.
export const revalidate = 60;

export default async function CoursesPage() {
  const courses = await getCourses();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">강좌 · 자료</h1>
        <p className="mt-2 text-[var(--secondary)]">
          초 · 중 · 고 · IB 과정별 동영상 강의와 학습자료 패키지
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.slug}
              href={`/courses/${course.slug}`}
              className="rounded-2xl border border-[var(--border-c)] bg-white p-6 transition-shadow hover:shadow-md"
            >
              <span className="inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
                {course.category}
              </span>
              <h2 className="mt-4 text-lg font-medium text-[var(--foreground)]">
                {course.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
                {course.description}
              </p>
              <p className="mt-4 text-base font-medium text-[var(--foreground)]">
                {course.price.toLocaleString()}원
              </p>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
