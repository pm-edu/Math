"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { EnrollmentRequest } from "@/lib/profile";
import { useAdminListQuery, type FilterFieldDef, type SortOptionDef } from "@/lib/admin/useAdminListQuery";
import type { StatusCountOption } from "@/lib/admin/list-query";
import { SummaryCountBar, FilterBar, SortSelect, BulkActionBar, Pagination, SelectAllCheckbox } from "@/components/admin/ManagedList";

const STATUS_LABEL: Record<string, string> = {
  pending: "입금 확인 중",
  paid: "수강 중",
  refunded: "환불됨",
};

// 이 화면의 목적이 "대기 중인 신청 처리"라, 기본 화면은 입금대기부터 보여준다(전체는 그다음 버튼).
const STATUS_OPTIONS: StatusCountOption[] = [
  { key: "pending", label: "입금 확인 중", status: { kind: "value", column: "status", value: "pending" } },
  { key: "all", label: "전체", status: { kind: "none" } },
  { key: "paid", label: "수강 중", status: { kind: "value", column: "status", value: "paid" } },
  { key: "refunded", label: "환불됨", status: { kind: "value", column: "status", value: "refunded" } },
];

const FILTER_DEFS: FilterFieldDef[] = [
  { key: "studentEmail", label: "학생 이메일 검색", kind: "text", column: "student_email" },
  { key: "courseTitle", label: "강좌명 검색", kind: "text", column: "course_title" },
];

const SORT_OPTIONS: SortOptionDef[] = [
  { value: "newest", label: "최신 신청순", column: "purchased_at", ascending: false },
  { value: "oldest", label: "오래된 신청순", column: "purchased_at", ascending: true },
];

export default function AdminEnrollmentsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const list = useAdminListQuery<EnrollmentRequest>({
    paramPrefix: "enroll",
    table: "enrollment_requests",
    filterDefs: FILTER_DEFS,
    statusOptions: STATUS_OPTIONS,
    sortOptions: SORT_OPTIONS,
    pageSize: 20,
  });

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (me?.role !== "owner" && me?.role !== "admin") { setAllowed(false); return; }
      setAllowed(true);
    }
    init();
  }, [router]);

  async function setStatus(row: EnrollmentRequest, status: string) {
    const label = status === "paid" ? "승인" : status === "refunded" ? "환불 처리" : "대기로 변경";
    if (!confirm(`"${row.student_name ?? row.student_email}" 님의 "${row.course_title}" 신청을 ${label}할까요?`)) return;

    const { error } = await createClient().from("purchases").update({ status }).eq("id", row.id);
    if (error) { setMessage(`처리에 실패했습니다: ${error.message}`); return; }
    setMessage(`${label} 완료.`);
    list.reload();
  }

  async function handleBulkApprove() {
    const targets = list.rows.filter((r) => list.selected.has(r.id) && r.status === "pending");
    if (targets.length === 0) {
      setMessage("선택한 항목 중 입금 확인 대기 상태인 신청이 없습니다.");
      return;
    }
    if (!confirm(`선택한 ${targets.length}건을 일괄 승인할까요? (입금 확인 대기 상태만 처리됩니다)`)) return;

    const { error } = await createClient()
      .from("purchases")
      .update({ status: "paid" })
      .in("id", targets.map((r) => r.id));
    if (error) { setMessage(`일괄 승인 실패: ${error.message}`); return; }
    setMessage(`${targets.length}건을 승인했습니다.`);
    list.clearSelection();
    list.reload();
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16"><p className="text-sm text-[var(--secondary)]">확인 중...</p></main>
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
          <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">마이페이지로</Link>
        </main>
        <Footer />
      </>
    );
  }

  const allOnPageSelected = list.rows.length > 0 && list.rows.every((r) => list.selected.has(r.id));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 학생 관리로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">수강 신청</h1>
        {message && <p className="mt-3 text-sm text-[var(--mint-dark)]">{message}</p>}

        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-[var(--foreground)]">신청 내역 {list.totalCount.toLocaleString()}건</h2>
            <SortSelect options={SORT_OPTIONS} value={list.sortValue} onChange={list.setSort} />
          </div>
          <SummaryCountBar options={STATUS_OPTIONS} counts={list.statusCounts} value={list.statusKey} onChange={list.setStatus} />
          <FilterBar defs={FILTER_DEFS} values={list.filters} onChange={list.setFilter} onClear={list.clearFilters} />
          {list.rows.length > 0 && (
            <SelectAllCheckbox checked={allOnPageSelected} onChange={list.toggleSelectAllOnPage} label="이 페이지 전체 선택" />
          )}
        </div>

        {list.loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : list.error ? (
          <p className="mt-8 text-sm text-red-600">{list.error}</p>
        ) : list.rows.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
            조건에 맞는 신청이 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {list.rows.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5 ${
                  list.selected.has(row.id) ? "border-[var(--pink)]" : "border-[var(--border-c)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={list.selected.has(row.id)}
                    onChange={() => list.toggleSelect(row.id)}
                    className="mt-1 h-4 w-4 accent-[var(--pink)]"
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {row.student_name ?? "이름 없음"}
                      <span className="ml-2 font-normal text-[var(--secondary)]">{row.student_email}</span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--secondary)]">
                      {row.course_title} · {row.course_price?.toLocaleString()}원 · {new Date(row.purchased_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      row.status === "paid" ? "bg-[var(--mint)] text-[var(--mint-dark)]" : "bg-[var(--border-c)] text-[var(--secondary)]"
                    }`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                  {row.status === "pending" && (
                    <button onClick={() => setStatus(row, "paid")} className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]">
                      승인
                    </button>
                  )}
                  {row.status === "paid" && (
                    <button onClick={() => setStatus(row, "refunded")} className="text-sm text-red-600 underline">
                      환불
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6">
          <Pagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.goToPage} />
        </div>
      </main>

      <div className="mx-auto max-w-5xl px-6">
        <BulkActionBar
          selectedCount={list.selected.size}
          onClear={list.clearSelection}
          actions={[{ label: "선택 일괄 승인", onClick: handleBulkApprove }]}
        />
      </div>

      <Footer />
    </>
  );
}
