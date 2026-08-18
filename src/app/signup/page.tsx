"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useLang } from "@/lib/i18n";

export default function SignupPage() {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  // 익명(체험) 세션 위에서 가입하면 새 계정을 만드는 게 아니라 같은 user_id를 유지한 채
  // 정식 계정으로 "승격"시킨다(updateUser) — 그래야 체험 중 쌓인 toefl_attempt가 그대로
  // 이 계정 것이 된다. 일반 가입(signUp)은 완전히 별개의 계정을 새로 만든다.
  const [isGuestUpgrade, setIsGuestUpgrade] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.is_anonymous) setIsGuestUpgrade(true);
    });
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = isGuestUpgrade
      ? await supabase.auth.updateUser({ email, password, data: { name } })
      : await supabase.auth.signUp({ email, password, options: { data: { name } } });

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
            {t("signupDone")}
          </h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">{t("signupDoneSub")}</p>
          <Link
            href="/login"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            {t("goLogin")}
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
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("signup")}</h1>
        {isGuestUpgrade && (
          <p className="mt-2 text-sm text-[var(--secondary)]">{t("signupGuestNote")}</p>
        )}

        <form onSubmit={handleSignup} className="mt-8 space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">{t("name")}</label>
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
            placeholder={t("pwPlaceholder")}
            minLength={6}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? t("signingUp") : t("signup")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--secondary)]">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-[var(--foreground)] underline">
            {t("login")}
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
