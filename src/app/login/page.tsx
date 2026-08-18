"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useLang } from "@/lib/i18n";

// TOEFL을 "완전히 독립된 사이트처럼" 보이게 하기 위해(signup/page.tsx 상단 주석 참고),
// ?toefl=1로 넘어온 방문자에게는 수학 사이트 공용 Header/Footer 대신 ToeflHeader만 보여주고,
// 로그인 성공 후에도 수학 홈("/") 대신 /toefl로 돌려보낸다.
export default function LoginPage() {
  const { t } = useLang();
  const isToefl = useSearchParams().get("toefl") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(authErrorMessage(error, "이메일 또는 비밀번호가 올바르지 않습니다."));
      return;
    }
    window.location.href = isToefl ? "/toefl" : "/";
  }

  return (
    <div data-theme={isToefl ? "en" : undefined} className={isToefl ? "min-h-screen bg-[var(--background)]" : undefined}>
      {isToefl ? <ToeflHeader /> : <Header />}
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("login")}</h1>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">{t("email")}</label>
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
            label={t("password")}
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />

          <p className="text-right">
            <Link
              href="/reset-password"
              className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
            >
              {t("forgotPassword")}
            </Link>
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? t("loggingIn") : t("login")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--secondary)]">
          {t("noAccount")}{" "}
          <Link href={isToefl ? "/signup?toefl=1" : "/signup"} className="text-[var(--foreground)] underline">
            {t("signup")}
          </Link>
        </p>
      </main>
      {!isToefl && <Footer />}
    </div>
  );
}
