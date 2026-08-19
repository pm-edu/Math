"use client";

// 세트(폼) 슬롯 현황 · 게시. docs/toefl-admin.html 의 VIEW 4 중 위쪽 절반.
//
// A단계라 아래쪽 "배포 관리" 표는 아직 없다 — 배포 대상·기간·응시율을 담을 테이블
// (수학의 worksheet_assignments 에 해당하는 toefl_assignment)이 아직 없기 때문이다.
// 슬롯 현황과 게시는 지금 스키마(toefl_form_blueprint.task_mix ↔ toefl_item)만으로 계산된다.
//
// 문항 수·시간은 화면에 하드코딩하지 않고 전부 블루프린트에서 가져온다(spec §2).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/toefl/admin/Topbar";
import Pipeline from "@/components/toefl/admin/Pipeline";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { buildSlotStatus, isFormComplete, totalShortage, type BlueprintRow, type ItemCounts, type ModuleRow, type SlotStatus } from "@/lib/toefl/admin-slots";
import { SECTION_TAG, moduleLabel } from "@/lib/toefl/admin-labels";

type FormRow = { id: string; code: string; title: string; blueprint_version: string; is_published: boolean };
type FormView = FormRow & { slots: SlotStatus[]; complete: boolean; shortage: number };

const PANEL = "rounded-xl border border-[var(--en-line)] bg-white shadow-[0_1px_2px_rgba(24,42,78,.05),0_6px_18px_rgba(24,42,78,.06)]";

export default function ToeflFormsPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<FormView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 모듈별 "오디오 없는 지문" 개수 — Listening/Speaking 게시 전 확인용 */
  const [pendingAudio, setPendingAudio] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: formRows }, { data: blueprint }, { data: modules }, { data: items }, { data: stimuli }] =
      await Promise.all([
        supabase.from("toefl_form").select("id, code, title, blueprint_version, is_published").order("created_at"),
        supabase.from("toefl_form_blueprint").select("version, section, stage, route, item_count, task_mix").eq("is_active", true),
        supabase.from("toefl_module").select("id, form_id, section, stage, route"),
        supabase.from("toefl_item").select("module_id, task_type").eq("is_active", true),
        supabase.from("toefl_stimulus").select("module_id, task_type, audio_path"),
      ]);

    const counts: ItemCounts = {};
    for (const it of items ?? []) {
      const m = (counts[it.module_id] ??= {});
      m[it.task_type] = (m[it.task_type] ?? 0) + 1;
    }

    // 오디오가 필요한 지문(듣기·말하기 유형)인데 audio_path가 비어 있는 것만 센다.
    const audioPending: Record<string, number> = {};
    for (const st of stimuli ?? []) {
      if (st.audio_path) continue;
      audioPending[st.module_id] = (audioPending[st.module_id] ?? 0) + 1;
    }
    setPendingAudio(audioPending);

    const views: FormView[] = ((formRows ?? []) as FormRow[]).map((f) => {
      const bp = ((blueprint ?? []) as (BlueprintRow & { version: string })[]).filter((b) => b.version === f.blueprint_version);
      const mods = ((modules ?? []) as (ModuleRow & { form_id: string })[]).filter((m) => m.form_id === f.id);
      const slots = buildSlotStatus(bp, mods, counts);
      return { ...f, slots, complete: isFormComplete(slots), shortage: totalShortage(slots) };
    });
    setForms(views);
    setSelectedId((prev) => prev ?? views.find((v) => !v.complete)?.id ?? views[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = forms.find((f) => f.id === selectedId) ?? null;

  async function togglePublish(form: FormView) {
    setBusy(true);
    setNotice(null);
    const supabase = createClient();
    const { error } = await supabase.from("toefl_form").update({ is_published: !form.is_published }).eq("id", form.id);
    setBusy(false);
    if (error) {
      setNotice(`변경하지 못했습니다: ${error.message}`);
      return;
    }
    setNotice(form.is_published ? `${form.code} 게시를 내렸습니다.` : `${form.code}을(를) 게시했습니다.`);
    load();
  }

  return (
    <>
      <Topbar title="세트 · 배포" crumb="블루프린트 슬롯이 모두 차야 게시할 수 있습니다" role={me.role} name={me.name} />
      <Pipeline here={["세트 구성", "배포"]} />

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : forms.length === 0 ? (
        <p className={`${PANEL} px-5 py-8 text-center text-[13px] text-[var(--en-ink-soft)]`}>등록된 세트가 없습니다.</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {forms.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                className={`${PANEL} px-[18px] py-4 text-left transition-transform hover:-translate-y-0.5 ${
                  f.id === selectedId ? "border-[var(--en-gold)] ring-2 ring-[var(--en-gold-soft)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <b className="num text-[13.5px]">{f.code}</b>
                  <span
                    className={`rounded-md px-2 py-[3px] text-[10.5px] font-extrabold ${
                      f.is_published ? "bg-[#E6F7F0] text-[var(--risk-lo)]" : "bg-[#FDF3DD] text-[#8A5B00]"
                    }`}
                  >
                    {f.is_published ? "게시됨" : "작성 중"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--en-ink-soft)]">
                  {f.title} · {f.complete ? "블루프린트 충족" : `${f.shortage}문항 부족`}
                </p>
                <div className="mt-2.5 flex gap-[3px]">
                  {f.slots.map((s, i) => (
                    <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[#EFF3FA]">
                      <span
                        className="block h-full rounded-[3px]"
                        style={{
                          width: `${s.required ? Math.min(100, (s.actual / s.required) * 100) : 0}%`,
                          background: SECTION_TAG[s.section].color,
                        }}
                      />
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <section className={PANEL}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--en-line)] px-[18px] py-3">
                <b className="text-sm">
                  {selected.code} — 블루프린트 슬롯 현황
                </b>
                <span className="text-xs text-[var(--en-ink-soft)]">
                  시간·문항 수는 블루프린트({selected.blueprint_version})를 따릅니다
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {["영역 · 모듈", "슬롯 충족", "오디오", "상태", ""].map((h, i) => (
                        <th
                          key={h || i}
                          className={`whitespace-nowrap border-b border-[var(--en-line)] bg-[#FAFBFE] px-3.5 py-2.5 text-[11.5px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)] ${
                            i === 4 ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.slots.map((s, i) => {
                      const pct = s.required ? Math.min(100, (s.actual / s.required) * 100) : 0;
                      const audio = s.moduleId ? (pendingAudio[s.moduleId] ?? 0) : 0;
                      const ok = s.actual >= s.required && s.shortages.length === 0;
                      return (
                        <tr key={i} className="border-b border-[var(--en-line)] last:border-b-0 hover:bg-[#FAFBFE]">
                          <td className="px-3.5 py-2.5">
                            <span
                              className="mr-2 inline-block rounded-md px-2 py-[3px] text-[10.5px] font-extrabold text-white"
                              style={{ background: SECTION_TAG[s.section].color }}
                            >
                              {SECTION_TAG[s.section].tag}
                            </span>
                            {moduleLabel(s.stage, s.route)}
                          </td>
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`num whitespace-nowrap text-[12.5px] font-bold ${ok ? "" : "text-[#B07A10]"}`}>
                                {s.actual} / {s.required}
                              </span>
                              <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full border border-[var(--en-line)] bg-[#EFF3FA]">
                                <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: SECTION_TAG[s.section].color }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            {audio > 0 ? (
                              <span className="text-[10.5px] font-bold text-[var(--risk-mid)]">● {audio}건 대기</span>
                            ) : (
                              <span className="text-[var(--en-ink-soft)]">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5">
                            {ok ? (
                              <span className="text-[11.5px] font-extrabold text-[var(--risk-lo)]">충족</span>
                            ) : (
                              <span className="text-[11.5px] font-extrabold text-[#B07A10]">
                                {s.shortages.length
                                  ? s.shortages.map((x) => `${x.taskType} ${x.required - x.actual}문항`).join(" · ")
                                  : `${s.required - s.actual}문항`}{" "}
                                부족
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <Link
                              href="/admin/toefl/items"
                              className="inline-flex rounded-[9px] border border-[var(--en-line)] bg-white px-2.5 py-[5px] text-xs font-bold hover:border-[var(--en-ink)]"
                            >
                              문항 생성
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="m-[18px] flex flex-wrap items-center gap-3 rounded-[10px] border border-[#F2DCAF] bg-[var(--en-gold-soft)] px-4 py-3">
                <span className="text-[12.5px] font-semibold text-[#8A5B00]">
                  {selected.is_published
                    ? selected.complete
                      ? "게시 중입니다 — 학생이 이 세트를 응시할 수 있습니다."
                      : `게시 중입니다 — 다만 ${selected.shortage}문항이 부족합니다. 응시 시 블루프린트가 요구하는 만큼 문항을 못 뽑습니다.`
                    : selected.complete
                      ? "모든 슬롯이 충족되었습니다. 게시하면 학생이 응시할 수 있습니다."
                      : "⚠ 슬롯이 모두 충족되어야 게시할 수 있습니다."}
                </span>
                <button
                  type="button"
                  disabled={busy || (!selected.is_published && !selected.complete)}
                  onClick={() => togglePublish(selected)}
                  className="ml-auto rounded-[9px] bg-[var(--en-gold)] px-3.5 py-2 text-[13px] font-bold text-[var(--en-on-gold)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selected.is_published
                    ? "게시 내리기"
                    : selected.complete
                      ? "폼 게시"
                      : `폼 게시 (${selected.shortage}문항 부족)`}
                </button>
              </div>
            </section>
          )}

          {notice && <p className="mt-3 text-[13px] font-semibold text-[var(--en-ink)]">{notice}</p>}

          <p className="mt-4 text-xs text-[var(--en-ink-soft)]">
            배포 관리(대상 반·기간·응시율·미응시자 메일)는 배포 테이블이 만들어지면 이 아래에 붙습니다.
          </p>
        </>
      )}
    </>
  );
}
