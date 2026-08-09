"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

export default function ContactPage() {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // 로그인 상태면 누가 남긴 문의인지 함께 기록한다.
    const { data } = await supabase.auth.getUser();

    const { error } = await supabase.from("contacts").insert({
      name,
      email,
      message,
      user_id: data.user?.id ?? null,
    });

    setLoading(false);
    if (error) {
      setError("문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setDone(true);
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-medium text-[var(--foreground)]">
          {t("contactPageTitle")}
        </h1>
        <p className="mt-2 text-[var(--secondary)]">{t("contactSubtitle")}</p>

        <div className="mt-6">
          <WhatsAppButton />
        </div>

        {done ? (
          <div className="mt-10 rounded-2xl border border-[var(--border-c)] bg-white p-8 text-center">
            <p className="text-lg font-medium text-[var(--foreground)]">{t("contactDone")}</p>
            <p className="mt-2 text-sm text-[var(--secondary)]">{t("contactDoneSub")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
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
            <div>
              <label className="text-sm font-medium text-[var(--foreground)]">{t("message")}</label>
              <textarea
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="문의하실 내용을 입력해주세요"
                className="mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? t("sending") : t("send")}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
