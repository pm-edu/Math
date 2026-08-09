"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Profile } from "@/lib/profile";

type PurchaseRow = { user_id: string; status: string };

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
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

      const [profileResult, purchaseResult, contactResult] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("purchases").select("user_id, status"),
        supabase
          .from("contacts")
          .select("id, name, email, message, created_at")
          .order("created_at", { ascending: false }),
      ]);

      setStudents((profileResult.data ?? []) as Profile[]);
      setPurchases((purchaseResult.data ?? []) as PurchaseRow[]);
      setContacts((contactResult.data ?? []) as Contact[]);
    }

    load();
  }, [router]);

  function purchaseCount(userId: string) {
    return purchases.filter((p) => p.user_id === userId && p.status === "paid").length;
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
          <p className="mt-3 text-sm text-[var(--secondary)]">
            이 화면은 관리자만 볼 수 있습니다.
          </p>
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

  const studentCount = students.filter((s) => s.role === "student").length;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-medium text-[var(--foreground)]">학생 관리</h1>
          <Link
            href="/admin/lessons"
            className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
          >
            강의 등록
          </Link>
        </div>
        <p className="mt-2 text-[var(--secondary)]">
          가입한 학생 {studentCount}명 · 문의 {contacts.length}건
        </p>

        <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">가입자</h2>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-c)] text-left text-[var(--secondary)]">
                <th className="px-5 py-3 font-medium">이름</th>
                <th className="px-5 py-3 font-medium">이메일</th>
                <th className="px-5 py-3 font-medium">구분</th>
                <th className="px-5 py-3 font-medium">수강 강좌</th>
                <th className="px-5 py-3 font-medium">가입일</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-[var(--secondary)]">
                    아직 가입한 학생이 없습니다.
                  </td>
                </tr>
              ) : (
                students.map((student) => (
                  <tr key={student.id} className="border-b border-[var(--border-c)] last:border-0">
                    <td className="px-5 py-4 text-[var(--foreground)]">
                      {student.name ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-[var(--secondary)]">
                      {student.email ?? "-"}
                    </td>
                    <td className="px-5 py-4">
                      {student.role === "admin" ? (
                        <span className="rounded-full bg-[var(--pink)] px-3 py-1 text-xs font-medium text-[var(--pink-dark)]">
                          관리자
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--mint-dark)]">
                          학생
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-[var(--foreground)]">
                      {purchaseCount(student.id)}개
                    </td>
                    <td className="px-5 py-4 text-[var(--secondary)]">
                      {new Date(student.created_at).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-14 text-lg font-medium text-[var(--foreground)]">문의</h2>

        {contacts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center text-sm text-[var(--secondary)]">
            아직 접수된 문의가 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="rounded-2xl border border-[var(--border-c)] bg-white p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {contact.name ?? "이름 없음"}
                    <a
                      href={`mailto:${contact.email}`}
                      className="ml-2 font-normal text-[var(--secondary)] underline"
                    >
                      {contact.email}
                    </a>
                  </p>
                  <p className="text-xs text-[var(--secondary)]">
                    {new Date(contact.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                  {contact.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
