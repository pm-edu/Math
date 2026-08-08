"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordField from "@/components/PasswordField";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

type Stage = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const linkError =
        url.searchParams.get("error_description") ?? hashParams.get("error_description");

      if (linkError) {
        setStage("invalid");
        return;
      }

      // 링크를 열면 supabase-js 가 URL의 토큰을 자동으로 소비해 세션을 만든다.
      // 자동 처리가 안 된 경우에만 code 를 직접 교환한다.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        setStage("ready");
        return;
      }

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          setStage("ready");
          return;
        }
      }

      setStage("invalid");
    }

    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("두 비밀번호가 서로 다릅니다.");
      return;
    }

    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(authErrorMessage(error, "비밀번호 변경에 실패했습니다."));
      return;
    }
    setStage("done");
  }

  if (stage === "checking") {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-sm text-[var(--secondary)]">링크를 확인하는 중...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (stage === "invalid") {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            링크가 유효하지 않습니다
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--secondary)]">
            링크가 만료되었거나 이미 사용된 것 같습니다.
            <br />
            재설정 메일을 다시 요청해주세요.
          </p>
          <Link
            href="/reset-password"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            다시 요청하기
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  if (stage === "done") {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">
            비밀번호가 변경되었습니다
          </h1>
          <p className="mt-3 text-sm text-[var(--secondary)]">
            새 비밀번호로 계속 이용하실 수 있습니다.
          </p>
          <button
            onClick={() => router.replace("/mypage")}
            className="mt-8 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            마이페이지로
          </button>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">새 비밀번호 설정</h1>
        <p className="mt-2 text-sm text-[var(--secondary)]">
          앞으로 사용하실 비밀번호를 입력해주세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <PasswordField
            label="새 비밀번호"
            value={password}
            onChange={setPassword}
            placeholder="6자 이상 입력해주세요"
            minLength={6}
          />
          <PasswordField
            label="새 비밀번호 확인"
            value={confirm}
            onChange={setConfirm}
            placeholder="한 번 더 입력해주세요"
            minLength={6}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
