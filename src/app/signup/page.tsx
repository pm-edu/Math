"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setLoading(false);
    if (error) {
      setError(authErrorMessage(error, "회원가입에 실패했습니다. 다시 시도해주세요."));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            가입 확인 이메일을 보냈어요
          </h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">
            메일함에서 인증 링크를 확인한 뒤 로그인해주세요.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            로그인하러 가기
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
        <h1 className="text-2xl font-medium text-[var(--foreground)]">회원가입</h1>

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">이름</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
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
          <PasswordField
            label="비밀번호"
            value={password}
            onChange={setPassword}
            placeholder="6자 이상 입력해주세요"
            minLength={6}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "가입 중..." : "회원가입"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--secondary)]">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-[var(--foreground)] underline">
            로그인
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
