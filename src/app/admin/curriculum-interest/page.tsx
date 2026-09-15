"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { curriculumDetailLabel } from "@/lib/curriculum";
import { MATH_PROGRAMS } from "@/components/home/data";
import { TRACK_GROUP, type TrackKey } from "@/lib/home/trackAvailability";

// 홈페이지 서브메뉴(/study/track/[key]/[detail])에서 들어온 "신청"을 관리자가 승인/거절한다
// (quirky-percolating-storm 계획 2차 방향 전환, 2026-09-15). /admin/enrollments(영상강좌 결제 승인)와
// 같은 원칙이지만 훨씬 단순해서(예상 물량 적음) useAdminListQuery/ManagedList 없이 직접 구현했다.

type Status = "pending" | "approved" | "rejected";

interface Row {
  student_id: string;
  track_key: string;
  curriculum_detail: string;
  status: Status;
  created_at: string;
  student_name: string | null;
  student_email: string | null;
}

const STATUS_LABEL: Record<Status, string> = { pending: "대기 중", approved: "승인됨", rejected: "거절됨" };
const TRACK_LABEL: Record<string, string> = Object.fromEntries(MATH_PROGRAMS.map((p) => [p.id, p.label]));

export default function AdminCurriculumInterestPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("pending");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const { data: interest, error } = await supabase
      .from("student_curriculum_interest")
      .select("student_id, track_key, curriculum_detail, status, created_at")
      .order("created_at", { ascending: false });
    if (error || !interest) {
      setLoading(false);
      return;
    }
    const studentIds = [...new Set(interest.map((r) => r.student_id))];
    const { data: profiles } = await supabase.from("profiles").select("id, name, email").in("id", studentIds);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setRows(
      interest.map((r) => ({
        ...r,
        status: r.status as Status,
        student_name: byId.get(r.student_id)?.name ?? null,
        student_email: byId.get(r.student_id)?.email ?? null,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (me?.role !== "owner" && me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      await load();
    }
    init();
  }, [router]);

  async function setStatus(row: Row, status: Status) {
    const label = STATUS_LABEL[status];
    const detailLabel = curriculumDetailLabel(TRACK_GROUP[row.track_key as TrackKey] ?? null, row.curriculum_detail);
    if (!confirm(`"${row.student_name ?? row.student_email}" 님의 "${detailLabel}" 신청을 ${label} 처리할까요?`)) return;
    const { error } = await createClient()
      .from("student_curriculum_interest")
      .update({ status })
      .eq("student_id", row.student_id)
      .eq("curriculum_detail", row.curriculum_detail);
    if (error) {
      setMessage(`처리에 실패했습니다: ${error.message}`);
      return;
    }
    setMessage(`${label} 처리 완료.`);
    load();
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-4xl px-6 py-16"><p className="text-sm text-[var(--secondary)]">확인 중...</p></main>
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

  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link href="/admin" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">← 관리자 홈으로</Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">과정 신청 승인</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          학생이 서브메뉴(학년/과정별 샘플 화면)에서 신청한 내역입니다. 승인하면 학생 마이페이지에 반영됩니다.
        </p>
        {message && <p className="mt-3 text-sm text-[var(--mint-dark)]">{message}</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {(["pending", "all", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                statusFilter === s ? "bg-[var(--pink)] text-[var(--pink-dark)]" : "bg-[var(--border-c)]/60 text-[var(--secondary)]"
              }`}
            >
              {s === "all" ? "전체" : STATUS_LABEL[s]} {s !== "all" && `(${rows.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center text-sm text-[var(--secondary)]">
            해당하는 신청이 없습니다.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {filtered.map((row) => (
              <li
                key={`${row.student_id}-${row.curriculum_detail}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-c)] bg-white p-5"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {row.student_name ?? "이름 없음"}
                    <span className="ml-2 font-normal text-[var(--secondary)]">{row.student_email}</span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--secondary)]">
                    {TRACK_LABEL[row.track_key] ?? row.track_key} ·{" "}
                    {curriculumDetailLabel(TRACK_GROUP[row.track_key as TrackKey] ?? null, row.curriculum_detail)} ·{" "}
                    {new Date(row.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      row.status === "approved"
                        ? "bg-[var(--mint)] text-[var(--mint-dark)]"
                        : row.status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-[var(--border-c)] text-[var(--secondary)]"
                    }`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                  {row.status === "pending" && (
                    <>
                      <button onClick={() => setStatus(row, "approved")} className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]">
                        승인
                      </button>
                      <button onClick={() => setStatus(row, "rejected")} className="text-sm text-red-600 underline">
                        거절
                      </button>
                    </>
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
