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
// (2026-09-15, RUN_SIGNUP.md: 수학 쪽(비isolated)은 --en-* 대신 --pink/--mint/--background.)
export default function LoginPage() {
  const { t, lang } = useLang();
  const params = useSearchParams();
  const isToefl = params.get("toefl") === "1";
  const isSat = params.get("sat") === "1";
  const isolated = isToefl || isSat;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsConfirm(false);
    setResendDone(false);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      if (error.code === "email_not_confirmed") {
        setNeedsConfirm(true);
        return;
      }
      setError(authErrorMessage(error, lang, t("loginFailedFallback")));
      return;
    }

    // 2026-09-15 이후 새 가입 흐름으로 처음 로그인하는 학생(약관 동의는 마쳤지만 아직 관심
    // 과목을 한 번도 고르지 않은 경우)만 온보딩으로 보낸다. terms_agreed_at은 기존
    // 가입자에겐 없는 값이라, 그걸 신규 가입 여부 표시로 그대로 쓴다(컬럼을 따로 더 안 만듦).
    // 각 서브도메인은 "완전히 다른 사이트처럼" 보여야 한다(2026-09-22 지시: "과목선택은
    // 각사이트에서") — 그 서브도메인에 왔다는 것 자체가 과목 선택이니, 다른 과목 카드가
    // 섞여 보이는 /onboarding/subjects로 보내지 않는다. math는 커리큘럼까지 더 골라야 해서
    // 전용 화면(/study/onboarding)으로, toefl/sat/english는 고를 게 더 없으니 관심만
    // 자동 기록하고 바로 그 과목 홈으로. 루트 도메인(pmedu4u.com)에서만 기존 4과목 카드.
    if (data.user) {
      const [{ data: profile }, { count }] = await Promise.all([
        supabase.from("profiles").select("terms_agreed_at").eq("id", data.user.id).maybeSingle(),
        supabase.from("student_programs").select("id", { count: "exact", head: true }).eq("student_id", data.user.id),
      ]);
      if (profile?.terms_agreed_at && !count) {
        const hostname = window.location.hostname;
        if (hostname.startsWith("math.")) {
          window.location.href = "/study/onboarding";
          return;
        }
        const directProgram = hostname.startsWith("toefl.")
          ? "toefl"
          : hostname.startsWith("sat.")
            ? "sat"
            : hostname.startsWith("english.")
              ? "english"
              : null;
        if (directProgram) {
          const token = data.session?.access_token;
          if (token) {
            await fetch("/api/study/programs", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ programs: [directProgram] }),
            }).catch(() => {});
          }
          window.location.href = `/${directProgram}`;
          return;
        }
        window.location.href = "/onboarding/subjects";
        return;
      }
    }

    setLoading(false);
    window.location.href = isToefl ? "/toefl" : isSat ? "/sat" : "/";
  }

  async function handleResend() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    setResendDone(true);
  }

  const inputClass = isolated
    ? "mt-1.5 w-full rounded-[10px] border border-en-line bg-white px-4 py-2.5 text-sm outline-none focus:border-en-gold"
    : "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";
  const labelClass = isolated ? "text-sm font-semibold text-en-ink" : "text-sm font-medium text-[var(--foreground)]";
  const linkClass = isolated ? "text-en-gold-deep underline" : "text-[var(--pink-dark)] underline";

  return (
    <div data-theme={isolated ? "en" : undefined} className="min-h-screen bg-[var(--background)]">
      {isToefl ? <ToeflHeader /> : isSat ? <SatHeader /> : <Header />}
      <main className={`min-h-screen px-6 py-16 ${isolated ? "bg-en-paper" : "bg-[var(--background)]"}`}>
        <div
          data-theme={isolated ? "en" : undefined}
          className={
            isolated
              ? "mx-auto max-w-md rounded-2xl border border-en-line bg-en-card p-8 shadow-sm"
              : "mx-auto max-w-md rounded-2xl border border-[var(--border-c)] bg-white p-8 shadow-sm"
          }
        >
          <h1 className={`text-2xl font-bold ${isolated ? "text-en-ink" : "text-[var(--foreground)]"}`}>{t("login")}</h1>

          {needsConfirm ? (
            <div className="mt-8 space-y-4">
              <p className={`text-sm font-semibold ${isolated ? "text-en-ink" : "text-[var(--foreground)]"}`}>
                {t("emailNotConfirmedTitle")}
              </p>
              <p className={`text-sm ${isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}`}>
                {t("emailNotConfirmedSub")}
              </p>
              {resendDone ? (
                <p className="text-sm text-[var(--mint-dark)]">{t("resendConfirmEmailDone")}</p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className={
                    isolated
                      ? "w-full rounded-[11px] bg-en-gold py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
                      : "w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
                  }
                >
                  {t("resendConfirmEmail")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setNeedsConfirm(false)}
                className={`w-full text-center text-sm underline ${isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}`}
              >
                {t("login")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="mt-8 space-y-4">
              <div>
                <label className={labelClass}>{t("email")}</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={inputClass}
                />
              </div>
              <PasswordField label={t("password")} value={password} onChange={setPassword} placeholder="••••••••" />

              <p className="text-right">
                <Link href="/reset-password" className={`text-sm ${isolated ? "text-en-ink-soft hover:text-en-ink" : "text-[var(--secondary)] hover:text-[var(--foreground)]"} underline`}>
                  {t("forgotPassword")}
                </Link>
              </p>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className={
                  isolated
                    ? "w-full rounded-[11px] bg-en-gold py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
                    : "w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
                }
              >
                {loading ? t("loggingIn") : t("login")}
              </button>
            </form>
          )}

          <p className={`mt-6 text-center text-sm ${isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}`}>
            {t("noAccount")}{" "}
            <Link href={isToefl ? "/signup?toefl=1" : isSat ? "/signup?sat=1" : "/signup"} className={linkClass}>
              {t("signup")}
            </Link>
          </p>
        </div>
      </main>
      {!isolated && <Footer />}
    </div>
  );
}
