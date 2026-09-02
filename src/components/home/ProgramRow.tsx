import Link from "next/link";
import type { Program } from "./data";

// 프로그램 아이콘 — 이모지 대신 인라인 SVG(24px 기준, 1.8 stroke 통일).
function ProgramIcon({ icon }: { icon: Program["icon"] }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "toefl":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
        </svg>
      );
    case "vocab":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 19.5V5a2 2 0 0 1 2-2h13v18H6.5A2.5 2.5 0 0 1 4 19.5Z" />
          <path d="M8 7h7M8 11h5" />
        </svg>
      );
    case "sat":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "ielts":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
        </svg>
      );
    case "general":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.35 0-2.62-.32-3.73-.9L3 20l1.02-4.5A8.44 8.44 0 0 1 3 11.5 8.5 8.5 0 0 1 11.5 3h1A8.5 8.5 0 0 1 21 11.5Z" />
        </svg>
      );
  }
}

// 화살표(연결) / 알림 신청 상태에 따라 오른쪽 끝 요소가 달라진다 — live면 화살표 원,
// soon이면 "알림 신청" 아웃라인 버튼(§2: soon은 링크로 만들면 클릭했다가 아무 일도 안 일어남).
export default function ProgramRow({ program }: { program: Program }) {
  const label = (
    <span className={`font-bold text-en-ink ${program.labelLang === "en" ? "font-[family-name:var(--font-en-num)] tracking-[-.02em]" : "tracking-[-.03em]"}`} style={{ fontSize: "1.0625rem" }}>
      {program.label}
    </span>
  );

  const body = (
    <>
      <span className="w-10 h-10 rounded-[11px] grid place-items-center shrink-0 bg-en-ink text-en-gold">
        <ProgramIcon icon={program.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          {label}
          {program.status === "live" ? (
            <span className="inline-flex items-center h-[22px] px-[9px] rounded-[6px] text-[.75rem] font-bold bg-en-success-soft text-en-success-ink">서비스 중</span>
          ) : (
            <span className="inline-flex items-center h-[22px] px-[9px] rounded-[6px] text-[.75rem] font-bold bg-en-line text-en-ink-soft">준비 중</span>
          )}
        </span>
        <span className="block mt-[3px] text-[.8125rem] leading-[1.55] text-en-ink-soft">{program.description}</span>
      </span>
    </>
  );

  if (program.status === "live" && program.href) {
    return (
      <Link
        href={program.href}
        className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-5 py-[17px] rounded-xl transition-colors hover:bg-en-gold-soft group"
      >
        {body}
        <span
          aria-hidden="true"
          className="w-[30px] h-[30px] rounded-full grid place-items-center border border-en-line text-en-ink-soft transition-colors group-hover:border-en-gold group-hover:text-en-gold-deep group-hover:bg-en-card"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </Link>
    );
  }

  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-4 px-5 py-[17px] rounded-xl opacity-[.66]">
      {body}
      <button
        type="button"
        className="inline-flex items-center justify-center h-[38px] px-[15px] rounded-[9px] border border-en-line bg-en-card text-[.8125rem] font-bold text-en-ink transition-colors hover:border-en-gold hover:text-en-gold-deep"
      >
        알림 신청
      </button>
    </div>
  );
}
