import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LessonPlayer from "@/components/LessonPlayer";
import { T } from "@/components/T";
import { createPublicClient } from "@/lib/supabase/server";
import { LESSON_COLUMNS, type Lesson } from "@/lib/lessons";

export const revalidate = 60;

type SampleLesson = Lesson & { course: { slug: string; title: string } | null };

async function getFreeLessons(): Promise<SampleLesson[]> {
  const { data, error } = await createPublicClient()
    .from("lessons")
    .select(`${LESSON_COLUMNS}, course:courses(slug, title)`)
    .eq("is_free", true)
    .order("position");

  if (error) return [];
  return (data ?? []) as unknown as SampleLesson[];
}

export default async function SamplePage() {
  const lessons = await getFreeLessons();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">
          <T k="sampleTitle" />
        </h1>
        <p className="mt-2 text-[var(--secondary)]">
          <T k="sampleSubtitle" />
        </p>

        {lessons.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-12 text-center">
            <p className="text-[var(--foreground)]">
              <T k="samplePreparing" />
            </p>
            <p className="mt-2 text-sm text-[var(--secondary)]">
              <T k="samplePreparingSub" />
            </p>
            <Link
              href="/courses"
              className="mt-6 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
            >
              <T k="browse" />
            </Link>
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {lessons.map((lesson) => (
              <div key={lesson.id}>
                {lesson.course && (
                  <Link
                    href={`/courses/${lesson.course.slug}`}
                    className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
                  >
                    {lesson.course.title}
                  </Link>
                )}
                <div className="mt-2">
                  <LessonPlayer lesson={lesson} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
