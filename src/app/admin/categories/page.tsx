"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/categories";

export default function AdminCategoriesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("categories")
      .select("id, name, name_en, position")
      .order("position");
    setCategories((data ?? []) as Category[]);
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
      if (me?.role !== "owner" && me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      load();
    }
    init();
  }, [router, load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!name.trim()) {
      setError("분류 이름을 입력해주세요.");
      return;
    }

    setSaving(true);
    const nextPos = categories.length > 0 ? Math.max(...categories.map((c) => c.position)) + 1 : 1;
    const { error } = await createClient().from("categories").insert({
      name: name.trim(),
      name_en: nameEn.trim() || null,
      position: nextPos,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505") setError("이미 같은 이름의 분류가 있습니다.");
      else setError(`등록 실패: ${error.message}`);
      return;
    }
    setName("");
    setNameEn("");
    setMessage("분류를 추가했습니다.");
    load();
  }

  async function handleDelete(cat: Category) {
    if (
      !confirm(
        `"${cat.name}" 분류를 삭제할까요?\n이 분류를 쓰는 기존 강좌는 그대로 남지만, 새 강좌 등록 목록에서 사라집니다.`
      )
    )
      return;
    const { error } = await createClient().from("categories").delete().eq("id", cat.id);
    if (error) {
      setError(`삭제 실패: ${error.message}`);
      return;
    }
    setMessage("분류를 삭제했습니다.");
    load();
  }

  async function move(cat: Category, dir: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    const supabase = createClient();
    await Promise.all([
      supabase.from("categories").update({ position: other.position }).eq("id", cat.id),
      supabase.from("categories").update({ position: cat.position }).eq("id", other.id),
    ]);
    load();
  }

  if (allowed === null)
    return (
      <Shell>
        <p className="text-sm text-[var(--secondary)]">확인 중...</p>
      </Shell>
    );
  if (allowed === false)
    return (
      <Shell>
        <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <Link
          href="/mypage"
          className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          마이페이지로
        </Link>
      </Shell>
    );

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <Link
          href="/admin/courses"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 강좌 관리로
        </Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">강좌 분류 관리</h1>
        <p className="mt-2 text-[var(--secondary)]">
          강좌를 만들 때 고를 수 있는 분류입니다. 여기서 추가·삭제·순서를 바꿀 수 있습니다.
        </p>

        <form
          onSubmit={handleAdd}
          className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6"
        >
          <p className="text-sm font-medium text-[var(--foreground)]">새 분류 추가</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">분류 이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="성인"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">영어 이름 (선택)</label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Adult"
                className={inputClass}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {saving ? "추가 중..." : "분류 추가"}
          </button>
        </form>

        <ul className="mt-8 space-y-2">
          {categories.map((cat, i) => (
            <li
              key={cat.id}
              className="flex items-center justify-between rounded-xl border border-[var(--border-c)] bg-white px-5 py-3"
            >
              <div>
                <span className="text-sm font-medium text-[var(--foreground)]">{cat.name}</span>
                {cat.name_en && (
                  <span className="ml-2 text-xs text-[var(--secondary)]">{cat.name_en}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => move(cat, -1)}
                  disabled={i === 0}
                  className="text-[var(--secondary)] disabled:opacity-30"
                  aria-label="위로"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(cat, 1)}
                  disabled={i === categories.length - 1}
                  className="text-[var(--secondary)] disabled:opacity-30"
                  aria-label="아래로"
                >
                  ↓
                </button>
                <button
                  onClick={() => handleDelete(cat)}
                  className="text-red-600 underline"
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">{children}</main>
      <Footer />
    </>
  );
}
