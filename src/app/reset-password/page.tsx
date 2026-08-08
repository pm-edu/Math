"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password/confirm`,
    });

    setLoading(false);
    if (error) {
      setError(authErrorMessage(error, "메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요."));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            재설정 메일을 보냈어요
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--secondary)]">
            {email} 로 링크를 보냈습니다.
            <br />
            메일함에서 링크를 눌러 새 비밀번호를 정해주세요.
          </p>
          <p className="mt-6 text-xs text-[var(--secondary)]">
            메일이 오지 않으면 스팸함을 확인해주세요.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            로그인으로 돌아가기
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">비밀번호 재설정</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          가입하신 이메일 주소를 입력하시면 재설정 링크를 보내드립니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">이메일</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "보내는 중..." : "재설정 메일 받기"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--secondary)]">
          <Link href="/login" className="text-[var(--foreground)] underline">
            로그인으로 돌아가기
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
