"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { EnrollmentRequest } from "@/lib/profile";

const STATUS_LABEL: Record<string, string> = {
  pending: "입금 확인 중",
  paid: "수강 중",
  refunded: "환불됨",
};

export default function AdminEnrollmentsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<EnrollmentRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    const { data } = await createClient()
      .from("enrollment_requests")
      .select("*")
      .order("purchased_at", { ascending: false });
    setRows((data ?? []) as EnrollmentRequest[]);
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
      loadRows();
    }
    init();
  }, [router, loadRows]);

  async function setStatus(row: EnrollmentRequest, status: string) {
    const label = status === "paid" ? "승인" : status === "refunded" ? "환불 처리" : "대기로 변경";
    if (!confirm(`"${row.student_name ?? row.student_email}" 님의 "${row.course_title}" 신청을 ${label}할까요?`))
      return;

    const { error } = await createClient()
      .from("purchases")
      .update({ status })
      .eq("id", row.id);

    if (error) {
      setMessage(`처리에 실패했습니다: ${error.message}`);
      return;
    }
    setMessage(`${label} 완료.`);
    loadRows();
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
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
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

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

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

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">수강 신청</h1>
        <p className="mt-2 text-[var(--secondary)]">입금 확인 대기 {pending.length}건</p>
        {message && <p className="mt-3 text-sm text-[var(--mint-dark)]">{message}</p>}

        <h2 className="mt-10 text-lg font-medium text-[var(--foreground)]">
          입금 확인 대기
        </h2>
        {pending.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
            대기 중인 신청이 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-c)] bg-white p-5"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {row.student_name ?? "이름 없음"}
                    <span className="ml-2 font-normal text-[var(--secondary)]">
                      {row.student_email}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--secondary)]">
                    {row.course_title} · {row.course_price?.toLocaleString()}원 ·{" "}
                    {new Date(row.purchased_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStatus(row, "paid")}
                    className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
                  >
                    승인
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-12 text-lg font-medium text-[var(--foreground)]">전체 내역</h2>
        {others.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
            아직 승인된 신청이 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {others.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-c)] bg-white p-5"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {row.student_name ?? "이름 없음"}
                    <span className="ml-2 font-normal text-[var(--secondary)]">
                      {row.student_email}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--secondary)]">{row.course_title}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      row.status === "paid"
                        ? "bg-[var(--mint)] text-[var(--mint-dark)]"
                        : "bg-[var(--border-c)] text-[var(--secondary)]"
                    }`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  {row.status === "paid" && (
                    <button
                      onClick={() => setStatus(row, "refunded")}
                      className="text-sm text-red-600 underline"
                    >
                      환불
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
