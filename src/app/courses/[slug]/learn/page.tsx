"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LessonPlayer from "@/components/LessonPlayer";
import { createClient } from "@/lib/supabase/client";
import { LESSON_COLUMNS, type Lesson } from "@/lib/lessons";

export default function LearnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      setLoggedIn(!!auth.user);

      const { data: course } = await supabase
        .from("courses")
        .select("id, title")
        .eq("slug", slug)
        .maybeSingle();

      if (!course) {
        setLoading(false);
        return;
      }
      setCourseTitle(course.title);

      // 열람 권한은 RLS가 판단한다. 권한이 없는 강의는 애초에 내려오지 않는다.
      const { data } = await supabase
        .from("lessons")
        .select(LESSON_COLUMNS)
        .eq("course_id", course.id)
        .order("position");

      const rows = (data ?? []) as Lesson[];
      setLessons(rows);
      setSelected(rows[0] ?? null);
      setLoading(false);
    }

    load();
  }, [slug]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href={`/courses/${slug}`}
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 강좌 소개로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">
          {courseTitle ?? "강의실"}
        </h1>

        {loading ? (
          <p className="mt-10 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : lessons.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center">
            <p className="text-[var(--foreground)]">아직 볼 수 있는 강의가 없습니다.</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--secondary)]">
              {loggedIn
                ? "이 강좌를 수강 신청하시면 전체 강의가 열립니다."
                : "로그인 후 수강 중인 강좌의 강의를 보실 수 있습니다."}
            </p>
            <Link
              href={loggedIn ? `/courses/${slug}` : "/login"}
              className="mt-6 inline-block rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
            >
              {loggedIn ? "강좌 살펴보기" : "로그인"}
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
            <nav className="rounded-2xl border border-[var(--border-c)] bg-white p-3">
              <ul className="space-y-1">
                {lessons.map((lesson, index) => {
                  const active = selected?.id === lesson.id;
                  return (
                    <li key={lesson.id}>
                      <button
                        onClick={() => setSelected(lesson)}
                        className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          active
                            ? "bg-[var(--mint)] text-[var(--mint-dark)]"
                            : "text-[var(--secondary)] hover:bg-[var(--pink-light)]"
                        }`}
                      >
                        <span className="mr-2 text-xs opacity-70">{index + 1}</span>
                        {lesson.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {selected && <LessonPlayer lesson={selected} />}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
