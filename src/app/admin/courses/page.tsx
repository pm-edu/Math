"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/categories";
import { useSubject, subjectLabel } from "@/lib/subject";
import { useLang } from "@/lib/i18n";

// 주소 이름 자동 생성용 분류 접두어 (알려진 분류만. 없으면 course 로 대체)
const CATEGORY_SLUG: Record<string, string> = {
  초등: "elementary",
  중등: "middle",
  고등: "high",
  IB: "ib",
};

type CourseRow = {
  id: string;
  slug: string;
  subject: string;
  category: string;
  title: string;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  price: number;
  price_inr: number | null;
  includes: string[] | null;
  includes_en: string[] | null;
};

// 등록·삭제 직후 미리 만들어 둔 페이지를 즉시 갱신한다.
function refreshSite() {
  fetch("/api/revalidate", { method: "POST" }).catch(() => {});
}

const EMPTY_FORM = {
  title: "",
  title_en: "",
  slug: "",
  category: "초등" as string,
  price: "",
  price_inr: "",
  description: "",
  description_en: "",
  includes: "",
  includes_en: "",
};

export default function AdminCoursesPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const { lang } = useLang();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // "__new__" = 새 분류 직접 입력 모드
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    const { data } = await createClient()
      .from("courses")
      .select(
        "id, slug, subject, category, title, title_en, description, description_en, price, price_inr, includes, includes_en"
      )
      .eq("subject", subject)
      .order("category")
      .order("price");
    setCourses((data ?? []) as CourseRow[]);
  }, [subject]);

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

      if (me?.role !== "owner" && me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      loadCourses();

      // 분류 목록을 DB에서 읽어온다.
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name, name_en, position")
        .order("position");
      const list = (cats ?? []) as Category[];
      setCategories(list);
      // 폼 기본 분류를 첫 번째 분류로 맞춘다.
      if (list[0]) setForm((f) => ({ ...f, category: list[0].name }));
    }

    init();
  }, [router, loadCourses]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    let slug = form.slug.trim().toLowerCase();
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      setError("주소 이름은 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있습니다. 예: high-basic");
      return;
    }

    // 분류를 결정한다. "직접 입력" 모드면 새 분류를 categories 에 먼저 등록한다.
    let category = form.category;
    if (form.category === "__new__") {
      const typed = newCategory.trim();
      if (!typed) {
        setError("새 분류 이름을 입력해주세요.");
        return;
      }
      const supabase = createClient();
      const nextPos =
        categories.length > 0 ? Math.max(...categories.map((c) => c.position)) + 1 : 1;
      // 이미 있으면 무시(중복 방지), 없으면 추가
      await supabase
        .from("categories")
        .insert({ name: typed, position: nextPos })
        .then(() => {});
      category = typed;
    }

    // 비워두면 분류 + 시간으로 자동 생성한다. 예: high-m3k9q1
    if (!slug) {
      slug = `${CATEGORY_SLUG[category] ?? "course"}-${Date.now().toString(36).slice(-6)}`;
    }

    const payload = {
      title: form.title.trim(),
      title_en: form.title_en.trim() || null,
      slug,
      subject,
      category,
      price: Number(form.price),
      price_inr: form.price_inr.trim() ? Number(form.price_inr) : null,
      description: form.description.trim() || null,
      description_en: form.description_en.trim() || null,
      includes: form.includes.trim()
        ? form.includes.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      includes_en: form.includes_en.trim()
        ? form.includes_en.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    };

    setSaving(true);
    const { error } = editingId
      ? await createClient().from("courses").update(payload).eq("id", editingId)
      : await createClient().from("courses").insert(payload);
    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        setError("이미 같은 주소 이름의 강좌가 있습니다. 다른 이름을 써주세요.");
      } else {
        setError(`${editingId ? "수정" : "등록"}에 실패했습니다: ${error.message}`);
      }
      return;
    }

    setForm({ ...EMPTY_FORM, category });
    setNewCategory("");
    setEditingId(null);
    setMessage(editingId ? "강좌를 수정했습니다. 사이트에 바로 반영됩니다." : "강좌를 만들었습니다. 사이트에 바로 반영됩니다.");
    refreshSite();
    loadCourses();
    // 새 분류를 추가했을 수 있으니 목록을 다시 읽는다.
    const { data: cats } = await createClient()
      .from("categories")
      .select("id, name, name_en, position")
      .order("position");
    setCategories((cats ?? []) as Category[]);
  }

  function handleEditStart(course: CourseRow) {
    setEditingId(course.id);
    setForm({
      title: course.title,
      title_en: course.title_en ?? "",
      slug: course.slug,
      category: course.category,
      price: String(course.price),
      price_inr: course.price_inr !== null ? String(course.price_inr) : "",
      description: course.description ?? "",
      description_en: course.description_en ?? "",
      includes: (course.includes ?? []).join(", "),
      includes_en: (course.includes_en ?? []).join(", "),
    });
    setError(null);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditCancel() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, category: categories[0]?.name ?? EMPTY_FORM.category });
    setError(null);
  }

  async function handleDelete(course: CourseRow) {
    if (
      !confirm(
        `"${course.title}" 강좌를 삭제할까요?\n이 강좌의 강의 목록도 함께 삭제되며, 되돌릴 수 없습니다.`
      )
    )
      return;

    const { error } = await createClient().from("courses").delete().eq("id", course.id);
    if (error) {
      if (error.code === "23503") {
        setError("이미 수강(구매) 기록이 있는 강좌는 삭제할 수 없습니다. 기록 보존을 위해 남겨두세요.");
      } else {
        setError(`삭제에 실패했습니다: ${error.message}`);
      }
      return;
    }
    setMessage("강좌를 삭제했습니다.");
    refreshSite();
    loadCourses();
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16">
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
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">강좌 관리</h1>
        <p className="mt-2 text-[var(--secondary)]">
          강좌를 만들면 사이트 강좌 목록에 1분 안에 나타납니다. 지금 접속한 도메인 기준으로{" "}
          <span className="font-medium text-[var(--foreground)]">{subjectLabel(subject, lang)}</span>{" "}
          강좌만 보이고 만들어집니다.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--foreground)]">
              {editingId ? "강좌 수정" : "새 강좌 만들기"}
            </p>
            {editingId && (
              <button
                type="button"
                onClick={handleEditCancel}
                className="text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)]"
              >
                수정 취소
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-[var(--foreground)]">분류</label>
                <Link href="/admin/categories" className="text-xs text-[var(--secondary)] underline">
                  분류 관리
                </Link>
              </div>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputClass}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ 새 분류 직접 입력</option>
              </select>
              {form.category === "__new__" && (
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="새 분류 이름 (예: 성인, 재수)"
                  className={inputClass}
                  autoFocus
                />
              )}
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">주소 이름 (선택)</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="비워두면 자동으로 만들어집니다"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--secondary)]">
                강좌 주소가 됩니다. 직접 정하려면 영문 소문자로: high-basic
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">강좌 이름</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="고등 수학 내신 완성"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">강좌 이름 (영어, 선택)</label>
              <input
                type="text"
                value={form.title_en}
                onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                placeholder="High School Math Complete"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--secondary)]">
                비우면 영어 화면에서도 한국어 이름이 나옵니다.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">가격 (원)</label>
              <input
                type="number"
                required
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="99000"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">가격 (루피, 선택)</label>
              <input
                type="number"
                min={0}
                value={form.price_inr}
                onChange={(e) => setForm({ ...form, price_inr: e.target.value })}
                placeholder="5900"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[var(--secondary)]">
                영어 화면에서 ₹ 로 표시됩니다. 비우면 원화로 표시됩니다.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">소개 (선택)</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="고1~고2 내신 대비 핵심 개념 정리"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">소개 (영어, 선택)</label>
              <textarea
                rows={2}
                value={form.description_en}
                onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                placeholder="Core concepts for grades 10-11"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">
                구성 (쉼표로 구분, 선택)
              </label>
              <input
                type="text"
                value={form.includes}
                onChange={(e) => setForm({ ...form, includes: e.target.value })}
                placeholder="동영상 24강, 요약노트 PDF, 기출문제 PDF"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">
                구성 (영어, 쉼표로 구분, 선택)
              </label>
              <input
                type="text"
                value={form.includes_en}
                onChange={(e) => setForm({ ...form, includes_en: e.target.value })}
                placeholder="24 video lessons, Summary notes PDF"
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {saving ? "저장 중..." : editingId ? "수정 저장" : "강좌 만들기"}
          </button>
        </form>

        <h2 className="mt-12 text-lg font-medium text-[var(--foreground)]">
          전체 강좌 {courses.length}개
        </h2>

        <ul className="mt-4 space-y-3">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-c)] bg-white p-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  <span className="mr-2 rounded-full bg-[var(--mint)] px-2.5 py-0.5 text-xs font-medium text-[var(--mint-dark)]">
                    {course.category}
                  </span>
                  {course.title}
                </p>
                <p className="mt-1 text-xs text-[var(--secondary)]">
                  /courses/{course.slug} · {course.price.toLocaleString()}원
                  {course.price_inr !== null && ` · ₹${course.price_inr.toLocaleString("en-IN")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => handleEditStart(course)}
                  className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(course)}
                  className="text-sm text-red-600 underline"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
