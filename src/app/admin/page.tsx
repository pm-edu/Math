"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";

type PurchaseRow = { user_id: string; status: string };

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

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

      const [profileResult, purchaseResult] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("purchases").select("user_id, status"),
      ]);

      setStudents((profileResult.data ?? []) as Profile[]);
      setPurchases((purchaseResult.data ?? []) as PurchaseRow[]);
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
        <h1 className="text-3xl font-medium text-[var(--foreground)]">학생 관리</h1>
        <p className="mt-2 text-[var(--secondary)]">
          가입한 학생 {studentCount}명
        </p>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
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
      </main>
      <Footer />
    </>
  );
}
