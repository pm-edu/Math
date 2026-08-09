"use client";

import { useLang } from "@/lib/i18n";

// 가격 표시. 한국어 화면은 원, 영어 화면은 루피.
// 환율로 자동 환산하지 않는다 — 환율은 매일 변해서 표시 가격과
// 실제 결제액이 어긋나기 때문에, 통화별 가격을 각각 정해서 쓴다.
// 루피 가격이 없는 강좌는 영어 화면에서 ₩ 표기로 보여준다.
export default function Price({
  krw,
  inr,
  className,
}: {
  krw: number;
  inr: number | null;
  className?: string;
}) {
  const { lang } = useLang();

  if (lang === "en") {
    if (inr !== null && inr !== undefined) {
      return <span className={className}>₹{inr.toLocaleString("en-IN")}</span>;
    }
    return <span className={className}>₩{krw.toLocaleString()}</span>;
  }

  return <span className={className}>{krw.toLocaleString()}원</span>;
}
