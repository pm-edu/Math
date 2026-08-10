"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang } from "@/lib/i18n";

type Status = "loading" | "guest" | "none" | "pending" | "paid";

export default function EnrollButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [status, setStatus] = useState<Status>("loading");
  const [bankInfo, setBankInfo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setStatus("guest");
        return;
      }

      const { data: purchase } = await supabase
        .from("purchases")
        .select("status")
        .eq("user_id", auth.user.id)
        .eq("course_id", courseId)
        .maybeSingle();

      if (purchase?.status === "paid") setStatus("paid");
      else if (purchase) setStatus("pending");
      else setStatus("none");
    }

    load();
  }, [courseId]);

  async function loadBankInfo() {
    const { data } = await createClient()
      .from("site_settings")
      .select("value")
      .eq("key", "bank_info")
      .maybeSingle();
    setBankInfo(data?.value ?? "");
  }

  async function handleEnroll() {
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("purchases").insert({
      user_id: auth.user.id,
      course_id: courseId,
      status: "pending",
    });
    setSubmitting(false);

    if (error) {
      // 23505 = 이미 신청함(중복). 상태를 다시 읽어 반영한다.
      if (error.code === "23505") {
        setStatus("pending");
        return;
      }
      setError(t("enrollFailed"));
      return;
    }

    await loadBankInfo();
    setStatus("pending");
  }

  // 신청 대기 상태면 계좌 안내를 함께 보여준다.
  useEffect(() => {
    if (status === "pending") loadBankInfo();
  }, [status]);

  const primaryBtn =
    "mt-4 w-full rounded-full bg-[var(--pink)] py-3 text-sm font-medium text-[var(--pink-dark)] transition-transform hover:scale-[1.01] disabled:opacity-60";

  if (status === "loading") {
    return <div className={primaryBtn.replace("hover:scale-[1.01]", "")} aria-hidden />;
  }

  if (status === "paid") {
    return (
      <p className="mt-4 w-full rounded-full bg-[var(--mint)] py-3 text-center text-sm font-medium text-[var(--mint-dark)]">
        {t("enrolled")}
      </p>
    );
  }

  if (status === "pending") {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-[var(--pink-light)]/40 p-5">
        <p className="text-sm font-medium text-[var(--foreground)]">{t("enrollDoneTitle")}</p>
        <p className="mt-1 text-sm text-[var(--secondary)]">{t("enrollDoneSub")}</p>
        <div className="mt-4 rounded-xl bg-white p-4">
          <p className="text-xs font-medium text-[var(--secondary)]">{t("bankInfoTitle")}</p>
          {bankInfo ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground)]">{bankInfo}</p>
          ) : (
            <p className="mt-1 text-sm text-[var(--secondary)]">{t("bankInfoPreparing")}</p>
          )}
        </div>
      </div>
    );
  }

  if (status === "guest") {
    return (
      <button onClick={() => router.push("/login")} className={primaryBtn}>
        {t("loginToEnroll")}
      </button>
    );
  }

  return (
    <>
      <button onClick={handleEnroll} disabled={submitting} className={primaryBtn}>
        {submitting ? t("enrolling") : t("enroll")}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}
