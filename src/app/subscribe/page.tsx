"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SubscribePage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<"math" | "english">("math");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, subject }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "구독 신청에 실패했습니다.");
      return;
    }
    setDone(true);
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-en-paper px-6 py-16">
        <div className="mx-auto max-w-md rounded-2xl border border-en-line bg-en-card p-8 shadow-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-en-gold-soft px-3 py-1 text-xs font-bold text-en-gold-deep">
            무료 구독
          </span>
          <h1 className="mt-4 text-2xl font-bold text-en-ink">주간 문제지 구독</h1>
          <p className="mt-2 text-sm text-en-ink-soft">
            계정을 만들지 않아도, 이메일만 남기면 매주 무료 연습 문제지를 받아보실 수 있습니다.
          </p>

          {done ? (
            <div className="mt-8 rounded-xl border border-en-line bg-en-gold-soft/40 p-6 text-center">
              <p className="text-sm font-semibold text-en-ink">구독 신청 완료</p>
              <p className="mt-2 text-sm text-en-ink-soft">
                다음 문제지 발송부터 {email}(으)로 받아보실 수 있습니다. 메일 안의 &ldquo;구독 해지&rdquo; 링크로 언제든 그만두실 수 있어요.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="text-sm font-semibold text-en-ink">이메일</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1.5 w-full rounded-[10px] border border-en-line bg-white px-4 py-2.5 text-sm outline-none focus:border-en-gold"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-en-ink">이름 (선택)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="mt-1.5 w-full rounded-[10px] border border-en-line bg-white px-4 py-2.5 text-sm outline-none focus:border-en-gold"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-en-ink">관심 과목</label>
                <div className="mt-2 flex gap-2">
                  {(["math", "english"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSubject(s)}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                        subject === s
                          ? "bg-en-gold text-en-ink"
                          : "border border-en-line bg-white text-en-ink-soft"
                      }`}
                    >
                      {s === "math" ? "수학" : "영어"}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[11px] bg-en-gold py-3 text-sm font-bold text-en-ink transition-colors hover:bg-en-gold-deep disabled:opacity-60"
              >
                {loading ? "신청 중..." : "무료로 구독하기"}
              </button>
              <p className="text-center text-xs text-en-ink-soft">
                언제든 메일 속 링크로 수신을 거부할 수 있습니다.
              </p>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
