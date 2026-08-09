import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getCourse, getCourses } from "@/lib/courses";

// DB에서 강좌를 수정하면 최대 1분 뒤 사이트에 반영된다.
export const revalidate = 60;

export async function generateStaticParams() {
  const courses = await getCourses();
  return courses.map((course) => ({ slug: course.slug }));
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getCourse(slug);

  if (!course) return notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <span className="inline-block rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
          {course.category}
        </span>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">
          {course.title}
        </h1>
        <p className="mt-3 text-[var(--secondary)]">{course.description}</p>

        <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <p className="text-sm font-medium text-[var(--foreground)]">구성</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--secondary)]">
            {course.includes.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="mt-6 text-xl font-medium text-[var(--foreground)]">
            {course.price.toLocaleString()}원
          </p>
          <button className="mt-4 w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01]">
            장바구니에 담기
          </button>
          <Link
            href={`/courses/${slug}/learn`}
            className="mt-3 block w-full rounded-full border border-[var(--border-c)] bg-white py-3 text-center text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
          >
            강의실 들어가기
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
