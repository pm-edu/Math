"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [bankInfo, setBankInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "bank_info")
        .maybeSingle();
      setBankInfo(data?.value ?? "");
    }
    init();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await createClient()
      .from("site_settings")
      .upsert({ key: "bank_info", value: bankInfo, updated_at: new Date().toISOString() });
    setSaving(false);
    setMessage(error ? `저장에 실패했습니다: ${error.message}` : "저장했습니다.");
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-16">
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

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">사이트 설정</h1>

        <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <label className="text-sm font-medium text-[var(--foreground)]">
            입금 계좌 안내
          </label>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            수강 신청한 학생에게 보여지는 입금 안내입니다. 은행·계좌번호·예금주를 적어주세요.
          </p>
          <textarea
            rows={4}
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            placeholder={"예)\n국민은행 123456-78-901234\n예금주: 홍길동"}
            className="mt-3 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
          />
          {message && <p className="mt-2 text-sm text-[var(--mint-dark)]">{message}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}
