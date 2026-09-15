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
// (2026-09-15, RUN_SIGNUP.md: 수학 쪽(비isolated)은 --en-* 토큰을 안 쓰고
// --pink/--mint/--background로 돌려놨다 — isolated 쪽은 원래대로 en 테마 유지.)

const CURRICULUM_OPTIONS: { value: string; label: string }[] = [
  { value: "KR", label: "한국(내신)" },
  { value: "IB", label: "IB" },
  { value: "IGCSE", label: "IGCSE" },
  { value: "CBSE", label: "CBSE" },
  { value: "AS_A_Level", label: "AS · A Level" },
];

const PHONE_RE = /^(\+82|\+91|0)[0-9\-\s]{7,14}$/;

function isPasswordValid(pw: string) {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
}

export default function SignupPage() {
  const { t } = useLang();
  const params = useSearchParams();
  const isToefl = params.get("toefl") === "1";
  const isSat = params.get("sat") === "1";
  const isolated = isToefl || isSat;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [curriculumGroup, setCurriculumGroup] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(password)) {
      setError("비밀번호는 영문+숫자를 포함해 8자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("passwordMismatch"));
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setError(t("phoneInvalid"));
      return;
    }
    if (!termsAgreed || !privacyAgreed) {
      setError(t("termsRequired"));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    // role은 여기서 절대 안 보낸다 — profiles.role은 컬럼 기본값('student')으로만 채워지고,
    // handle_new_user() 트리거도 raw_user_meta_data에서 role을 읽지 않는다(이번 작업에서
    // 트리거 자체를 안 건드렸다). 전화번호·커리큘럼·약관 동의 시각은 클라이언트가 profiles를
    // 직접 못 쓰게 돼 있어(202609151500_signup_hardening.sql) signUp() 이후 별도로
    // /api/auth/complete-signup(service_role)에 맡긴다.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setLoading(false);
      setError(authErrorMessage(error, "회원가입에 실패했습니다. 다시 시도해주세요."));
      return;
    }

    if (data.user) {
      const res = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          phone,
          curriculumGroup,
          termsAgreed,
          privacyAgreed,
        }),
      });
      if (!res.ok) {
        // 가입(auth.users) 자체는 이미 성공했으니 계정은 만들어졌다 — 전화번호·커리큘럼
        // 저장만 실패한 것이므로 가입 실패로 취급하진 않고, 로그로 남을 수 있게 에러만
        // 콘솔에 남긴다. 사용자는 로그인 후 마이페이지에서 다시 채울 수 있다.
        console.error("complete-signup 저장 실패");
      }
    }

    setLoading(false);
    setDone(true);
  }

  if (done) {
    return (
      <div data-theme={isolated ? "en" : undefined} className="min-h-screen bg-[var(--background)]">
        {isToefl ? <ToeflHeader /> : isSat ? <SatHeader /> : <Header />}
        <main className={`min-h-screen px-6 py-24 text-center ${isolated ? "bg-en-paper" : "bg-[var(--background)]"}`}>
          <h1 className={`text-2xl font-bold ${isolated ? "text-en-ink" : "text-[var(--foreground)]"}`}>{t("signupDone")}</h1>
          <p className={`mt-3 text-sm ${isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}`}>{t("signupDoneSub")}</p>
          <Link
            href={isToefl ? "/login?toefl=1" : isSat ? "/login?sat=1" : "/login"}
            className={
              isolated
                ? "mt-8 inline-block rounded-[11px] bg-en-gold px-6 py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep"
                : "mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01]"
            }
          >
            {t("goLogin")}
          </Link>
        </main>
        {!isolated && <Footer />}
      </div>
    );
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
          <h1 className={`text-2xl font-bold ${isolated ? "text-en-ink" : "text-[var(--foreground)]"}`}>{t("signup")}</h1>

          <form onSubmit={handleSignup} className="mt-8 space-y-4">
            <div>
              <label className={labelClass}>{t("name")}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                className={inputClass}
              />
            </div>
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
            <PasswordField
              label={t("password")}
              value={password}
              onChange={setPassword}
              placeholder={t("pwPlaceholder")}
              minLength={8}
            />
            <PasswordField
              label={t("passwordConfirm")}
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              placeholder={t("pwPlaceholder")}
              minLength={8}
            />
            <div>
              <label className={labelClass}>{t("phone")}</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678 / +91 98765 43210"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("curriculum")}</label>
              <select
                required
                value={curriculumGroup}
                onChange={(e) => setCurriculumGroup(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  {t("selectPlaceholder")}
                </option>
                {CURRICULUM_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <p className={`rounded-lg px-3 py-2 text-xs ${isolated ? "bg-en-gold-soft text-en-ink-soft" : "bg-[var(--mint)] text-[var(--mint-dark)]"}`}>
              {t("minorNotice")}
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className={isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}>
                  {t("termsCheckLabel")}{" "}
                  <Link href="/terms" target="_blank" className={linkClass}>
                    {t("toefl_landing_terms")}
                  </Link>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={privacyAgreed}
                  onChange={(e) => setPrivacyAgreed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className={isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}>
                  {t("privacyCheckLabel")}{" "}
                  <Link href="/privacy" target="_blank" className={linkClass}>
                    보기
                  </Link>
                </span>
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading || !termsAgreed || !privacyAgreed}
              className={
                isolated
                  ? "w-full rounded-[11px] bg-en-gold py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
                  : "w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
              }
            >
              {loading ? t("signingUp") : t("signup")}
            </button>
          </form>

          <p className={`mt-6 text-center text-sm ${isolated ? "text-en-ink-soft" : "text-[var(--secondary)]"}`}>
            {t("haveAccount")}{" "}
            <Link href={isToefl ? "/login?toefl=1" : isSat ? "/login?sat=1" : "/login"} className={linkClass}>
              {t("login")}
            </Link>
          </p>
        </div>
      </main>
      {!isolated && <Footer />}
    </div>
  );
}
