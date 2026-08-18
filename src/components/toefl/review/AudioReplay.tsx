"use client";

import { useLang } from "@/lib/i18n";

// 응시 중(AudioPlayer.tsx)과 달리 리뷰 화면은 자유롭게 되감기·다시듣기가 허용된다(제출 후라
// §6의 "재생 1회" 제약이 더 이상 적용되지 않음) — 그래서 브라우저 기본 컨트롤을 그냥 쓴다.

export default function AudioReplay({ src, label }: { src: string | null; label?: string }) {
  const { t } = useLang();
  if (!src) return <p className="text-xs text-[var(--secondary)]">{t("toefl_audioUnavailable")}</p>;
  return (
    <div>
      {label && <p className="mb-1 text-xs font-medium text-[var(--secondary)]">{label}</p>}
      <audio controls src={src} aria-label={label ?? "Audio"} className="w-full" />
    </div>
  );
}
