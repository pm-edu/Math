"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useLang } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useLang();
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
    window.location.href = "/";
  }

  return (
    <>
      <Header />
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
          <Link href="/signup" className="text-[var(--foreground)] underline">
            {t("signup")}
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
