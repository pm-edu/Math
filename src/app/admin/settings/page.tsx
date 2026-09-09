"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { HERO_REPORT_KEY } from "@/lib/home-report";
import type { ReportPreviewProps } from "@/components/home/ReportPreview";

const DEFAULT_REPORT: ReportPreviewProps = {
  studentName: "김서연",
  className: "TOEFL 준비반",
  band: 4.5,
  scaledScore: 92,
  units: [
    { name: "Reading · 추론", accuracy: 88 },
    { name: "Listening · 태도 파악", accuracy: 74 },
    { name: "Writing · 근거 전개", accuracy: 52, weak: true },
  ],
  focusUnit: "Writing · 근거 전개",
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [bankInfo, setBankInfo] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<ReportPreviewProps>(DEFAULT_REPORT);
  const [savingReport, setSavingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (me?.role !== "owner" && me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const [bankResult, reportResult] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "bank_info").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", HERO_REPORT_KEY).maybeSingle(),
      ]);
      setBankInfo(bankResult.data?.value ?? "");
      if (reportResult.data?.value) {
        try {
          setReport({ ...DEFAULT_REPORT, ...JSON.parse(reportResult.data.value) });
        } catch {
          // 저장된 값이 깨졌으면 기본 예시로 보여준다 — 화면이 죽는 것보단 낫다.
        }
      }
    }
    init();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const { error } = await createClient()
      .from("site_settings")
      .upsert({ key: "bank_info", value: bankInfo, updated_at: new Date().toISOString() });
    setSaving(false);
    setMessage(error ? `저장에 실패했습니다: ${error.message}` : "저장했습니다.");
  }

  function updateUnit(i: number, patch: Partial<ReportPreviewProps["units"][number]>) {
    setReport((prev) => ({
      ...prev,
      units: prev.units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)),
    }));
  }

  async function handleSaveReport() {
    setSavingReport(true);
    setReportMessage(null);
    const { error } = await createClient()
      .from("site_settings")
      .upsert({ key: HERO_REPORT_KEY, value: JSON.stringify(report), updated_at: new Date().toISOString() });
    setSavingReport(false);
    setReportMessage(error ? `저장에 실패했습니다: ${error.message}` : "저장했습니다. 홈 화면에 바로 반영됩니다.");
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">확인 중...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <Link
            href="/mypage"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">사이트 설정</h1>

        <div className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <label className="text-sm font-medium text-[var(--foreground)]">
            입금 계좌 안내
          </label>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            수강 신청한 학생에게 보여지는 입금 안내입니다. 은행·계좌번호·예금주를 적어주세요.
          </p>
          <textarea
            rows={4}
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            placeholder={"예)\n국민은행 123456-78-901234\n예금주: 홍길동"}
            className="mt-3 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
          />
          {message && <p className="mt-2 text-sm text-[var(--mint-dark)]">{message}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <label className="text-sm font-medium text-[var(--foreground)]">홈 화면 리포트 예시</label>
          <p className="mt-1 text-xs text-[var(--secondary)]">
            홈 화면 맨 위에 보이는 &ldquo;이번 주 리포트&rdquo; 카드입니다. 공지처럼 언제든 다른 학생·점수로 바꿔서 보여줄 수 있습니다.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[var(--secondary)]">학생 이름</label>
              <input
                type="text"
                value={report.studentName}
                onChange={(e) => setReport({ ...report, studentName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--secondary)]">반 이름</label>
              <input
                type="text"
                value={report.className}
                onChange={(e) => setReport({ ...report, className: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--secondary)]">밴드 점수 (1.0~6.0)</label>
              <input
                type="number"
                min={1}
                max={6}
                step={0.1}
                value={report.band}
                onChange={(e) => setReport({ ...report, band: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--secondary)]">환산 점수 (0~120)</label>
              <input
                type="number"
                min={0}
                max={120}
                value={report.scaledScore}
                onChange={(e) => setReport({ ...report, scaledScore: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
              />
            </div>
          </div>

          <p className="mt-5 text-xs font-medium text-[var(--secondary)]">단원별 정답률 (3개)</p>
          <div className="mt-2 space-y-2">
            {report.units.map((u, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={u.name}
                  onChange={(e) => updateUnit(i, { name: e.target.value })}
                  placeholder="예) Reading · 추론"
                  className="min-w-[180px] flex-1 rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={u.accuracy}
                  onChange={(e) => updateUnit(i, { accuracy: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                />
                <span className="text-xs text-[var(--secondary)]">%</span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--secondary)]">
                  <input type="checkbox" checked={!!u.weak} onChange={(e) => updateUnit(i, { weak: e.target.checked })} />
                  약점 단원
                </label>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium text-[var(--secondary)]">다음 주 집중 단원</label>
            <input
              type="text"
              value={report.focusUnit}
              onChange={(e) => setReport({ ...report, focusUnit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--border-c)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>

          {reportMessage && <p className="mt-3 text-sm text-[var(--mint-dark)]">{reportMessage}</p>}
          <button
            onClick={handleSaveReport}
            disabled={savingReport}
            className="mt-4 rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {savingReport ? "저장 중..." : "저장"}
          </button>
        </div>
      </main>
      <Footer />
    </>
  );
}
