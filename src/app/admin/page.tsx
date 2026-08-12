"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Profile } from "@/lib/profile";
import {
  isStaff,
  canManageSite,
  canManageStudents,
  canAssignRoles,
  assignableRoles,
  ROLE_LABELS,
  type Role,
} from "@/lib/roles";

type PurchaseRow = { user_id: string; status: string };

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [students, setStudents] = useState<Profile[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
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

      if (!isStaff(me?.role)) {
        setAllowed(false);
        return;
      }
      setMyRole((me?.role ?? null) as Role | null);
      setAllowed(true);
      loadData();
    }

    init();
  }, [router, loadData]);

  async function handleRemoveStudent(student: Profile) {
    if (
      !confirm(
        `"${student.name ?? student.email}" 님을 탈퇴시킬까요?\n계정과 학습 기록이 모두 삭제되며 되돌릴 수 없습니다.`
      )
    )
      return;

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUserId: student.id }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setNotice(data.message ?? "탈퇴 처리에 실패했습니다.");
      return;
    }
    setNotice(`${student.name ?? student.email} 님을 탈퇴 처리했습니다.`);
    loadData();
  }

  async function handleSetRole(target: Profile, newRole: string) {
    if (newRole === target.role) return;
    if (
      !confirm(
        `"${target.name ?? target.email}" 님의 역할을 "${ROLE_LABELS[newRole as Role]}"(으)로 바꿀까요?`
      )
    )
      return;
    const { error } = await createClient().rpc("set_user_role", {
      target_id: target.id,
      new_role: newRole,
    });
    if (error) {
      setNotice(`역할 변경 실패: ${error.message}`);
      return;
    }
    setNotice(`${target.name ?? target.email} 님을 ${ROLE_LABELS[newRole as Role]}(으)로 변경했습니다.`);
    loadData();
  }

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
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">이 화면은 관리 권한이 있어야 볼 수 있습니다.</p>
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
  const canAssign = canAssignRoles(myRole);
  const assignChoices = assignableRoles(myRole);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-medium text-[var(--foreground)]">관리</h1>
            {myRole && (
              <p className="mt-1 text-sm text-[var(--secondary)]">
                내 권한: <span className="font-medium text-[var(--foreground)]">{ROLE_LABELS[myRole]}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/problems"
              className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
            >
              문제은행
            </Link>
            <Link
              href="/admin/worksheets"
              className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
            >
              문제지 · 배포
            </Link>
            {canManageSite(myRole) && (
              <>
                <Link
                  href="/admin/enrollments"
                  className="rounded-full bg-[var(--pink)] px-5 py-2.5 text-sm font-medium text-[var(--pink-dark)]"
                >
                  수강 신청
                </Link>
                <Link
                  href="/admin/courses"
                  className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  강좌 관리
                </Link>
                <Link
                  href="/admin/lessons"
                  className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  강의 등록
                </Link>
                <Link
                  href="/admin/mail"
                  className="rounded-full bg-[var(--mint)] px-5 py-2.5 text-sm font-medium text-[var(--mint-dark)]"
                >
                  메일 보내기
                </Link>
                <Link
                  href="/admin/settings"
                  className="rounded-full border border-[var(--border-c)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--foreground)]"
                >
                  사이트 설정
                </Link>
              </>
            )}
          </div>
        </div>

        {notice && (
          <p className="mt-4 rounded-lg bg-[var(--mint)]/40 px-4 py-2 text-sm text-[var(--foreground)]">
            {notice}
          </p>
        )}

        {/* 가입자 명단 · 권한 관리 (교사 이상) */}
        {canManageStudents(myRole) ? (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[var(--foreground)]">가입자 · 권한</h2>
              <p className="text-sm text-[var(--secondary)]">학생 {studentCount}명</p>
            </div>
            {canAssign && (
              <p className="mt-1 text-xs text-[var(--secondary)]">
                각 사용자의 역할을 드롭다운으로 지정할 수 있습니다.
                {myRole === "admin" && " (관리자·최종관리자 지정은 최종관리자만 가능)"}
              </p>
            )}

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border-c)] bg-white">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-c)] text-left text-[var(--secondary)]">
                    <th className="px-5 py-3 font-medium">이름</th>
                    <th className="px-5 py-3 font-medium">이메일</th>
                    <th className="px-5 py-3 font-medium">권한</th>
                    <th className="px-5 py-3 font-medium">수강 강좌</th>
                    <th className="px-5 py-3 font-medium">가입일</th>
                    <th className="px-5 py-3 font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-[var(--secondary)]">
                        아직 가입자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => {
                      // 내가 이 사용자의 역할을 바꿀 수 있는지 (admin 은 상위 관리자를 못 바꾼다)
                      const editable =
                        canAssign &&
                        assignChoices.includes(student.role) &&
                        !(myRole === "admin" && (student.role === "owner" || student.role === "admin"));
                      return (
                        <tr key={student.id} className="border-b border-[var(--border-c)] last:border-0">
                          <td className="px-5 py-4 text-[var(--foreground)]">{student.name ?? "-"}</td>
                          <td className="px-5 py-4 text-[var(--secondary)]">{student.email ?? "-"}</td>
                          <td className="px-5 py-4">
                            {editable ? (
                              <select
                                value={student.role}
                                onChange={(e) => handleSetRole(student, e.target.value)}
                                className="rounded-lg border border-[var(--border-c)] bg-white px-2 py-1 text-xs"
                              >
                                {assignChoices.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="rounded-full bg-[var(--pink-light)] px-3 py-1 text-xs font-medium text-[var(--secondary)]">
                                {ROLE_LABELS[student.role]}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-[var(--foreground)]">{purchaseCount(student.id)}개</td>
                          <td className="px-5 py-4 text-[var(--secondary)]">
                            {new Date(student.created_at).toLocaleDateString("ko-KR")}
                          </td>
                          <td className="px-5 py-4">
                            {student.role === "student" && canManageSite(myRole) && (
                              <button
                                onClick={() => handleRemoveStudent(student)}
                                className="text-sm text-red-600 underline hover:text-red-700"
                              >
                                탈퇴
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-10 text-sm text-[var(--secondary)]">
            자료(문제은행·문제지)를 관리할 수 있습니다. 위 메뉴에서 이동하세요.
          </p>
        )}

        {/* 문의 (사이트 운영자만) */}
        {canManageSite(myRole) && (
          <>
            <h2 className="mt-14 text-lg font-medium text-[var(--foreground)]">문의 {contacts.length}건</h2>
            {contacts.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-10 text-center text-sm text-[var(--secondary)]">
                아직 접수된 문의가 없습니다.
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {contacts.map((contact) => (
                  <li key={contact.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {contact.name ?? "이름 없음"}
                        <a href={`mailto:${contact.email}`} className="ml-2 font-normal text-[var(--secondary)] underline">
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
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
