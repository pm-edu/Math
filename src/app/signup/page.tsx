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

// /login·/signup·/reset-password는 수학·영어·TOEFL·SAT이 공유하는 계정 인프라다(로그인
// 자체는 하나). TOEFL/SAT은 "완전히 독립된 사이트처럼" 보여야 해서, 그쪽에서 여기로 넘어온
// 방문자에게는 수학 사이트 공용 Header/Footer(과목전환·강좌메뉴 등) 대신 각자의 전용 헤더만
// 보여준다. 판정은 ?toefl=1 / ?sat=1 쿼리 파라미터로 한다(각 전용 헤더의 "Log in" 링크가
// 항상 이 파라미터를 붙여서 넘어온다) — 호스트네임(toefl.pmedu4u.com 등) 대신 쿼리로
// 판정하는 이유는 이 프로젝트가 지금 pmedu4u.com/toefl, pmedu4u.com/sat 경로로도 그대로
// 접근되고 있어서, 서브도메인 유무와 무관하게 항상 동작하게 하기 위함.
export default function SignupPage() {
  const { t } = useLang();
  const params = useSearchParams();
  const isToefl = params.get("toefl") === "1";
  const isSat = params.get("sat") === "1";
  const isolated = isToefl || isSat;
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
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });

    setLoading(false);
    if (error) {
      setError(authErrorMessage(error, "회원가입에 실패했습니다. 다시 시도해주세요."));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div data-theme={isolated ? "en" : undefined} className={isolated ? "min-h-screen bg-[var(--background)]" : undefined}>
        {isToefl ? <ToeflHeader /> : isSat ? <SatHeader /> : <Header />}
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            {t("signupDone")}
          </h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">{t("signupDoneSub")}</p>
          <Link
            href={isToefl ? "/login?toefl=1" : isSat ? "/login?sat=1" : "/login"}
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            {t("goLogin")}
          </Link>
        </main>
        {!isolated && <Footer />}
      </div>
    );
  }

  return (
    <div data-theme={isolated ? "en" : undefined} className={isolated ? "min-h-screen bg-[var(--background)]" : undefined}>
      {isToefl ? <ToeflHeader /> : isSat ? <SatHeader /> : <Header />}
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("signup")}</h1>

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
          <Link
            href={isToefl ? "/login?toefl=1" : isSat ? "/login?sat=1" : "/login"}
            className="text-[var(--foreground)] underline"
          >
            {t("login")}
          </Link>
        </p>
      </main>
      {!isolated && <Footer />}
    </div>
  );
}
