"use client";

// TOEFL 관리자 대시보드. docs/toefl-admin.html 의 VIEW 1.
//
// A단계(스키마 변경 없음)라, 목업의 KPI 4개 중 지금 데이터로 계산되지 않는 것
// (AI 채점 검수 대기 · 문항 검수 대기 · 배포 중 콘텐츠 · 리스크 학생)은 넣지 않았다.
// 그 넷은 toefl_item 검수 상태 컬럼(B단계)과 배포 테이블·리스크 정의(C단계)가 필요하다.
// 대신 지금 실제로 계산되는 값 넷을 같은 카드 디자인으로 보여준다 — 숫자를 지어내지 않는다.
//
// "오늘의 작업 큐"도 같은 이유로 지금 판별 가능한 항목(슬롯 부족 폼)만 담는다.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/toefl/admin/Topbar";
import Pipeline from "@/components/toefl/admin/Pipeline";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { buildSlotStatus, isFormComplete, totalShortage, type BlueprintRow, type ItemCounts, type ModuleRow } from "@/lib/toefl/admin-slots";
import { SECTION_TAG, moduleLabel, routeLabel } from "@/lib/toefl/admin-labels";

type FormRow = { id: string; code: string; title: string; blueprint_version: string; is_published: boolean };
type AttemptRow = {
  id: string;
  user_id: string;
  form_id: string;
  mode: string;
  submitted_at: string | null;
  overall_band: number | null;
};

type Kpi = { label: string; value: string; sub: string; tone?: "urgent" | "alert" };
type IncompleteForm = { form: FormRow; shortage: number; detail: string };
type RecentAttempt = { id: string; name: string; mode: string; band: number | null; route: string };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ToeflAdminDashboardPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [incomplete, setIncomplete] = useState<IncompleteForm[]>([]);
  const [recent, setRecent] = useState<RecentAttempt[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();

    const [{ data: forms }, { data: blueprint }, { data: modules }, { data: items }, { data: attempts }] =
      await Promise.all([
        supabase.from("toefl_form").select("id, code, title, blueprint_version, is_published").order("created_at"),
        supabase.from("toefl_form_blueprint").select("version, section, stage, route, item_count, task_mix").eq("is_active", true),
        supabase.from("toefl_module").select("id, form_id, section, stage, route"),
        supabase.from("toefl_item").select("module_id, task_type").eq("is_active", true),
        supabase
          .from("toefl_attempt")
          .select("id, user_id, form_id, mode, submitted_at, overall_band")
          .not("submitted_at", "is", null)
          .order("submitted_at", { ascending: false })
          .limit(50),
      ]);

    // 모듈별·유형별 문항 수 집계
    const counts: ItemCounts = {};
    for (const it of items ?? []) {
      const m = (counts[it.module_id] ??= {});
      m[it.task_type] = (m[it.task_type] ?? 0) + 1;
    }

    // 폼별 슬롯 충족 판정
    const shortFalls: IncompleteForm[] = [];
    for (const f of (forms ?? []) as FormRow[]) {
      const bp = ((blueprint ?? []) as (BlueprintRow & { version: string })[]).filter((b) => b.version === f.blueprint_version);
      const mods = ((modules ?? []) as (ModuleRow & { form_id: string })[]).filter((m) => m.form_id === f.id);
      const slots = buildSlotStatus(bp, mods, counts);
      if (!isFormComplete(slots)) {
        const worst = slots.filter((s) => s.actual < s.required).sort((a, b) => b.required - a.required - (a.actual - b.actual))[0];
        shortFalls.push({
          form: f,
          shortage: totalShortage(slots),
          detail: worst
            ? `${SECTION_TAG[worst.section].label} ${moduleLabel(worst.stage, worst.route)} 슬롯 ${worst.required - worst.actual}문항 부족`
            : "슬롯 미충족",
        });
      }
    }
    setIncomplete(shortFalls);

    // 최근 응시 — 이름과 Stage 2 라우팅 결과를 붙인다
    const list = ((attempts ?? []) as AttemptRow[]).slice(0, 8);
    const userIds = Array.from(new Set(list.map((a) => a.user_id)));
    const attemptIds = list.map((a) => a.id);
    const [{ data: profiles }, { data: sections }] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id, name").in("id", userIds) : Promise.resolve({ data: [] }),
      attemptIds.length
        ? supabase.from("toefl_section_attempt").select("attempt_id, section, routed_to").in("attempt_id", attemptIds)
        : Promise.resolve({ data: [] }),
    ]);
    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.name as string) ?? "이름 없음"]));
    setRecent(
      list.map((a) => {
        const rows = (sections ?? []).filter((s) => s.attempt_id === a.id && s.routed_to);
        const route = rows
          .map((s) => `${SECTION_TAG[s.section as keyof typeof SECTION_TAG]?.short ?? s.section}${routeLabel(s.routed_to as string)}`)
          .join(" ");
        return {
          id: a.id,
          name: nameById.get(a.user_id) ?? "이름 없음",
          mode: a.mode === "full" ? "풀 모의" : "영역 연습",
          band: a.overall_band,
          route,
        };
      })
    );

    const weekAgo = Date.now() - WEEK_MS;
    const thisWeek = ((attempts ?? []) as AttemptRow[]).filter((a) => a.submitted_at && Date.parse(a.submitted_at) >= weekAgo).length;
    const publishedCount = ((forms ?? []) as FormRow[]).filter((f) => f.is_published).length;

    setKpis([
      {
        label: "등록된 문항",
        value: String((items ?? []).length),
        sub: `활성 문항 기준 · 모듈 ${Object.keys(counts).length}개에 배치됨`,
      },
      {
        label: "게시된 세트",
        value: `${publishedCount} / ${(forms ?? []).length}`,
        sub: publishedCount === 0 ? "게시된 세트가 없어 학생이 응시할 수 없습니다" : "학생에게 열려 있는 세트 수",
        tone: publishedCount === 0 ? "alert" : undefined,
      },
      {
        label: "최근 7일 응시 완료",
        value: String(thisWeek),
        sub: `제출 완료 기준 · 최근 전체 ${(attempts ?? []).length}건`,
      },
      {
        label: "슬롯 미충족 세트",
        value: String(shortFalls.length),
        sub: shortFalls.length ? "블루프린트 기준 문항이 부족해 게시할 수 없습니다" : "모든 세트가 블루프린트를 충족합니다",
        tone: shortFalls.length ? "urgent" : undefined,
      },
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Topbar title="대시보드" crumb="지금 데이터로 계산되는 항목만 보여줍니다" role={me.role} name={me.name} />
      <Pipeline here={["응시·리포트"]} />

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <div
                key={k.label}
                className={`rounded-xl border border-[var(--en-line)] border-l-4 bg-white px-[18px] py-4 shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)] ${
                  k.tone === "alert"
                    ? "border-l-[var(--risk-hi)]"
                    : k.tone === "urgent"
                      ? "border-l-[var(--en-gold)]"
                      : "border-l-[var(--en-line)]"
                }`}
              >
                <div className="text-xs font-bold text-[var(--en-ink-soft)]">{k.label}</div>
                <div className="num my-0.5 text-[30px] font-bold leading-tight">{k.value}</div>
                <div className="text-[11.5px] text-[var(--en-ink-soft)]">{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <section className="rounded-xl border border-[var(--en-line)] bg-white shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)]">
              <div className="flex items-center justify-between border-b border-[var(--en-line)] px-[18px] py-3">
                <b className="text-sm">오늘의 작업 큐</b>
                <Link href="/admin/toefl/forms" className="text-xs font-bold text-[var(--en-gold-deep)]">
                  세트 · 배포
                </Link>
              </div>
              {incomplete.length === 0 ? (
                <p className="px-[18px] py-8 text-center text-[13px] text-[var(--en-ink-soft)]">
                  처리할 항목이 없습니다. 모든 세트가 블루프린트를 충족합니다.
                </p>
              ) : (
                <ul>
                  {incomplete.map((f) => (
                    <li key={f.form.id} className="flex items-center gap-3 border-b border-[var(--en-line)] px-[18px] py-3 text-[13px] last:border-b-0 hover:bg-[#FAFBFE]">
                      <span className="flex-none rounded-md bg-[var(--en-ink)] px-2 py-[3px] text-[10.5px] font-extrabold text-white">FORM</span>
                      <span className="text-xs text-[var(--en-ink-soft)]">
                        <b className="text-[var(--en-ink)]">{f.form.code}</b> · {f.detail}
                      </span>
                      <Link
                        href="/admin/toefl/forms"
                        className="ml-auto rounded-[9px] border border-[var(--en-line)] bg-white px-2.5 py-[5px] text-xs font-bold hover:border-[var(--en-ink)]"
                      >
                        세트 열기
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-[var(--en-line)] px-[18px] py-2.5 text-[11.5px] text-[var(--en-ink-soft)]">
                AI 채점 검수·문항 검수 대기는 검수 상태 컬럼이 생기면 여기에 함께 표시됩니다.
              </p>
            </section>

            <section className="rounded-xl border border-[var(--en-line)] bg-white shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)]">
              <div className="flex items-center justify-between border-b border-[var(--en-line)] px-[18px] py-3">
                <b className="text-sm">최근 응시 완료</b>
                <Link href="/admin/toefl/students" className="text-xs font-bold text-[var(--en-gold-deep)]">
                  학생 관리
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="px-[18px] py-8 text-center text-[13px] text-[var(--en-ink-soft)]">아직 제출된 응시가 없습니다.</p>
              ) : (
                <ul>
                  {recent.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 border-b border-[var(--en-line)] px-[18px] py-3 text-[13px] last:border-b-0 hover:bg-[#FAFBFE]">
                      <span className="font-bold">{r.name}</span>
                      <span className="text-xs text-[var(--en-ink-soft)]">
                        {r.mode}
                        {r.route && ` · ${r.route}`}
                      </span>
                      <span className="num ml-auto rounded-md bg-[var(--en-gold-soft)] px-2 py-0.5 text-[13px] font-bold text-[var(--en-gold-deep)]">
                        {r.band == null ? "채점 전" : r.band.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
