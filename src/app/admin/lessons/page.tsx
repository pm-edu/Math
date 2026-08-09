"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { LESSON_COLUMNS, type Lesson } from "@/lib/lessons";

type CourseOption = { id: string; slug: string; title: string };

const EMPTY_FORM = {
  title: "",
  description: "",
  video_url: "",
  material_url: "",
  is_free: false,
};

export default function AdminLessonsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [courseId, setCourseId] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLessons = useCallback(async (id: string) => {
    if (!id) {
      setLessons([]);
      return;
    }
    const { data } = await createClient()
      .from("lessons")
      .select(LESSON_COLUMNS)
      .eq("course_id", id)
      .order("position");
    setLessons((data ?? []) as Lesson[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const { data: courseRows } = await supabase
        .from("courses")
        .select("id, slug, title")
        .order("price");

      const list = (courseRows ?? []) as CourseOption[];
      setCourses(list);
      if (list[0]) {
        setCourseId(list[0].id);
        loadLessons(list[0].id);
      }
    }

    init();
  }, [router, loadLessons]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    // 새 강의는 항상 맨 뒤에 붙인다.
    const nextPosition =
      lessons.length === 0 ? 1 : Math.max(...lessons.map((l) => l.position)) + 1;

    const { error } = await createClient().from("lessons").insert({
      course_id: courseId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      video_url: form.video_url.trim() || null,
      material_url: form.material_url.trim() || null,
      is_free: form.is_free,
      position: nextPosition,
    });

    setSaving(false);

    if (error) {
      setError(`등록에 실패했습니다: ${error.message}`);
      return;
    }

    setForm(EMPTY_FORM);
    setMessage("강의를 등록했습니다.");
    loadLessons(courseId);
  }

  async function handleDelete(lesson: Lesson) {
    if (!confirm(`"${lesson.title}" 강의를 삭제할까요? 되돌릴 수 없습니다.`)) return;

    const { error } = await createClient().from("lessons").delete().eq("id", lesson.id);
    if (error) {
      setError(`삭제에 실패했습니다: ${error.message}`);
      return;
    }
    setMessage("강의를 삭제했습니다.");
    loadLessons(courseId);
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-4xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">확인 중...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            접근 권한이 없습니다
          </h1>
          <Link
            href="/mypage"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">강의 등록</h1>
        <p className="mt-2 text-[var(--secondary)]">
          강좌를 고르고 영상 주소를 넣으면 강의실에 바로 반영됩니다.
        </p>

        <div className="mt-8">
          <label className="text-sm font-medium text-[var(--foreground)]">강좌 선택</label>
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              loadLessons(e.target.value);
            }}
            className={inputClass}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6"
        >
          <p className="text-sm font-medium text-[var(--foreground)]">새 강의 추가</p>

          <div>
            <label className="text-sm text-[var(--foreground)]">강의 제목</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="1강. 함수의 개념"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-sm text-[var(--foreground)]">설명 (선택)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="이 강의에서 다루는 내용"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-sm text-[var(--foreground)]">영상 주소</label>
            <input
              type="url"
              value={form.video_url}
              onChange={(e) => setForm({ ...form, video_url: e.target.value })}
              placeholder="https://youtu.be/..."
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-[var(--secondary)]">
              YouTube(일부공개 권장) 또는 Vimeo 주소를 그대로 붙여넣으세요.
            </p>
          </div>

          <div>
            <label className="text-sm text-[var(--foreground)]">학습자료 주소 (선택)</label>
            <input
              type="url"
              value={form.material_url}
              onChange={(e) => setForm({ ...form, material_url: e.target.value })}
              placeholder="https://drive.google.com/..."
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={form.is_free}
              onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
              className="h-4 w-4"
            />
            무료 샘플로 공개 (로그인 없이도 볼 수 있습니다)
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            type="submit"
            disabled={saving || !courseId}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {saving ? "등록 중..." : "강의 등록"}
          </button>
        </form>

        <h2 className="mt-12 text-lg font-medium text-[var(--foreground)]">
          등록된 강의 {lessons.length}개
        </h2>

        {lessons.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center text-sm text-[var(--secondary)]">
            이 강좌에는 아직 강의가 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {lessons.map((lesson) => (
              <li
                key={lesson.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-c)] bg-white p-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    <span className="mr-2 text-[var(--secondary)]">{lesson.position}</span>
                    {lesson.title}
                    {lesson.is_free && (
                      <span className="ml-2 rounded-full bg-[var(--mint)] px-2.5 py-0.5 text-xs font-medium text-[var(--mint-dark)]">
                        무료
                      </span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--secondary)]">
                    {lesson.video_url ?? "영상 미등록"}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(lesson)}
                  className="shrink-0 text-sm text-red-600 underline"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
