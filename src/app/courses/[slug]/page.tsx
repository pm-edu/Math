import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Price from "@/components/Price";
import EnrollButton from "@/components/EnrollButton";
import { T, CategoryLabel, L, LocalizedList } from "@/components/T";
import { getCourse, getCourses } from "@/lib/courses";

// DB에서 강좌를 수정하면 최대 1분 뒤 사이트에 반영된다.
export const revalidate = 60;

export async function generateStaticParams() {
  // 두 과목 강좌 주소를 모두 미리 만들어 둔다 (실제 접근 도메인과 무관하게).
  const [math, english] = await Promise.all([getCourses("math"), getCourses("english")]);
  return [...math, ...english].map((course) => ({ slug: course.slug }));
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
          <CategoryLabel value={course.category} />
        </span>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">
          <L ko={course.title} en={course.title_en} />
        </h1>
        <p className="mt-3 text-[var(--secondary)]">
          <L ko={course.description} en={course.description_en} />
        </p>

        <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <p className="text-sm font-medium text-[var(--foreground)]">
            <T k="includes" />
          </p>
          <LocalizedList
            ko={course.includes}
            en={course.includes_en}
            className="mt-3 space-y-2 text-sm text-[var(--secondary)]"
          />
          <p className="mt-6 text-xl font-medium text-[var(--foreground)]">
            <Price krw={course.price} inr={course.price_inr} />
          </p>
          <EnrollButton courseId={course.id} />
          <Link
            href={`/courses/${slug}/learn`}
            className="mt-3 block w-full rounded-full border border-[var(--border-c)] bg-white py-3 text-center text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--mint)]/40"
          >
            <T k="enterClassroom" />
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
