"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import SatHeader from "@/components/sat/SatHeader";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useLang } from "@/lib/i18n";

// TOEFL/SAT을 "완전히 독립된 사이트처럼" 보이게 하기 위해(signup/page.tsx 상단 주석 참고),
// ?toefl=1 / ?sat=1로 넘어온 방문자에게는 수학 사이트 공용 Header/Footer 대신 각자의 전용
// 헤더만 보여주고, 로그인 성공 후에도 수학 홈("/") 대신 각자의 랜딩으로 돌려보낸다.
export default function LoginPage() {
  const { t } = useLang();
  const params = useSearchParams();
  const isToefl = params.get("toefl") === "1";
  const isSat = params.get("sat") === "1";
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
    window.location.href = isToefl ? "/toefl" : isSat ? "/sat" : "/";
  }

  const isolated = isToefl || isSat;

  return (
    <div data-theme={isolated ? "en" : undefined} className={isolated ? "min-h-screen bg-[var(--background)]" : undefined}>
      {isToefl ? <ToeflHeader /> : isSat ? <SatHeader /> : <Header />}
      <main className="min-h-screen bg-en-paper px-6 py-16">
        <div data-theme="en" className="mx-auto max-w-md rounded-2xl border border-en-line bg-en-card p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-en-ink">{t("login")}</h1>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <div>
              <label className="text-sm font-semibold text-en-ink">{t("email")}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1.5 w-full rounded-[10px] border border-en-line bg-white px-4 py-2.5 text-sm outline-none focus:border-en-gold"
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
                className="text-sm text-en-ink-soft underline hover:text-en-ink"
              >
                {t("forgotPassword")}
              </Link>
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[11px] bg-en-gold py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
            >
              {loading ? t("loggingIn") : t("login")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-en-ink-soft">
            {t("noAccount")}{" "}
            <Link
              href={isToefl ? "/signup?toefl=1" : isSat ? "/signup?sat=1" : "/signup"}
              className="font-semibold text-en-gold-deep underline"
            >
              {t("signup")}
            </Link>
          </p>
        </div>
      </main>
      {!isolated && <Footer />}
    </div>
  );
}
