"use client";

// 관리 화면 상단바 (docs/toefl-admin.html 의 .topbar).
// 목업의 검색창은 아직 붙일 대상이 없어 넣지 않았다 — 화면별 필터가 먼저다.

import { ROLE_LABELS, type Role } from "@/lib/roles";

export default function Topbar({
  title,
  crumb,
  role,
  name,
  right,
}: {
  title: string;
  crumb?: string;
  role: Role | null;
  name?: string | null;
  right?: React.ReactNode;
}) {
  const initial = (name ?? "").trim().charAt(0) || "관";

  return (
    <div className="mb-[18px] flex h-[60px] flex-wrap items-center gap-3.5 border-b border-[var(--en-line)]">
      <h1 className="text-[17px] font-extrabold tracking-[-.02em]">{title}</h1>
      {crumb && <span className="text-xs text-[var(--en-ink-soft)]">{crumb}</span>}
      <div className="ml-auto flex items-center gap-2.5">
        {right}
        {role && (
          <span className="rounded-full border border-[var(--en-line)] bg-white px-2.5 py-[3px] text-[11px] font-bold text-[var(--en-ink-soft)]">
            {ROLE_LABELS[role]}
          </span>
        )}
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--en-ink)] text-xs font-extrabold text-white">
          {initial}
        </span>
      </div>
    </div>
  );
}
