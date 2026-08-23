"use client";

// 문항 검수 큐. docs/toefl-admin.html VIEW 3.
//
// toefl_item.verified=false 인 문항은 toefl_item_public 뷰(마이그레이션 202608191600)에서
// 걸러져 학생에게 절대 안 보인다 — 이 화면이 그 초안들을 관리자가 찾아서 승인/반려하는
// 유일한 통로다. CLI(scripts/toefl-generate.ts)가 만드는 문항도 전부 verified=false로
// 저장되므로, 이 화면이 없으면 CLI로 만든 문항은 영원히 아무 데도 안 보인 채로 DB에만 쌓인다.
//
// 지문(stimulus) 텍스트는 학생 화면과 똑같이 노출하면 정답 유출 위험이 있는 유형(예:
// listen_and_repeat의 target_sentence는 이미 저장 단계에서 payload에 안 담긴다)도 있지만,
// 여기는 관리자 전용 화면이라 payload를 그대로 보여줘도 안전하다(검수가 곧 "정답까지 확인"이다).

import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { catalogEntry } from "@/lib/toefl/task-catalog";
import { moduleLabel } from "@/lib/toefl/admin-labels";

type DraftItem = {
  id: string;
  module_id: string;
  stimulus_id: string | null;
  task_type: string;
  prompt: string;
  payload: unknown;
  answer_key: unknown;
  explanation_ko: string | null;
  source: string;
  created_at: string;
};

type ModuleInfo = { id: string; section: string; stage: string; route: string; formCode: string; formTitle: string };
type StimulusInfo = { id: string; title: string | null; body: string | null; transcript: string | null };

const SOURCE_LABEL: Record<string, string> = { ai: "AI 생성", manual: "직접 등록", seed: "시드 데이터" };

export default function ToeflReviewPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [modules, setModules] = useState<Map<string, ModuleInfo>>(new Map());
  const [stimuli, setStimuli] = useState<Map<string, StimulusInfo>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: draftItems, error: itemsErr } = await supabase
      .from("toefl_item")
      .select("id, module_id, stimulus_id, task_type, prompt, payload, answer_key, explanation_ko, source, created_at")
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(300);
    if (itemsErr) {
      setError(`불러오기 실패: ${itemsErr.message}`);
      setLoading(false);
      return;
    }
    const rows = (draftItems ?? []) as DraftItem[];

    const moduleIds = Array.from(new Set(rows.map((r) => r.module_id)));
    const stimulusIds = Array.from(new Set(rows.map((r) => r.stimulus_id).filter((x): x is string => !!x)));

    const [{ data: mods }, { data: stims }] = await Promise.all([
      moduleIds.length
        ? supabase.from("toefl_module").select("id, form_id, section, stage, route").in("id", moduleIds)
        : Promise.resolve({ data: [] as { id: string; form_id: string; section: string; stage: string; route: string }[] }),
      stimulusIds.length
        ? supabase.from("toefl_stimulus").select("id, title, body, transcript").in("id", stimulusIds)
        : Promise.resolve({ data: [] as StimulusInfo[] }),
    ]);

    const formIds = Array.from(new Set((mods ?? []).map((m) => m.form_id)));
    const { data: forms } = formIds.length
      ? await supabase.from("toefl_form").select("id, code, title").in("id", formIds)
      : { data: [] as { id: string; code: string; title: string }[] };
    const formById = new Map((forms ?? []).map((f) => [f.id, f]));

    const moduleMap = new Map<string, ModuleInfo>();
    for (const m of mods ?? []) {
      const f = formById.get(m.form_id);
      moduleMap.set(m.id, {
        id: m.id,
        section: m.section,
        stage: m.stage,
        route: m.route,
        formCode: f?.code ?? "(삭제된 폼)",
        formTitle: f?.title ?? "",
      });
    }
    setModules(moduleMap);
    setStimuli(new Map((stims ?? []).map((s) => [s.id, s as StimulusInfo])));
    setItems(rows);
    setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, DraftItem[]>();
    for (const it of items) {
      const mod = modules.get(it.module_id);
      const key = mod ? `${mod.formCode} · ${moduleLabel(mod.stage, mod.route)}` : "(알 수 없는 모듈)";
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return map;
  }, [items, modules]);

  const selected = items.find((it) => it.id === selectedId) ?? null;
  const selectedStimulus = selected?.stimulus_id ? (stimuli.get(selected.stimulus_id) ?? null) : null;

  function withBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approve(id: string) {
    setError(null);
    withBusy(id, true);
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("toefl_item")
      .update({ verified: true, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    withBusy(id, false);
    if (updateErr) {
      setError(`승인 실패: ${updateErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function reject(id: string) {
    setError(null);
    if (!confirm("이 문항을 반려(삭제)합니다. 되돌릴 수 없습니다. 계속할까요?")) return;
    withBusy(id, true);
    const supabase = createClient();
    const { error: deleteErr } = await supabase.from("toefl_item").delete().eq("id", id);
    withBusy(id, false);
    if (deleteErr) {
      setError(`반려 실패: ${deleteErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function approveGroup(groupItems: DraftItem[]) {
    if (!confirm(`이 그룹의 ${groupItems.length}문항을 한 번에 승인합니다. 계속할까요?`)) return;
    setError(null);
    const ids = groupItems.map((it) => it.id);
    ids.forEach((id) => withBusy(id, true));
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("toefl_item")
      .update({ verified: true, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
      .in("id", ids);
    ids.forEach((id) => withBusy(id, false));
    if (updateErr) {
      setError(`일괄 승인 실패: ${updateErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => !ids.includes(it.id)));
  }

  return (
    <>
      <Topbar title="문항 검수" crumb="저장 전까지 학생에게 노출되지 않습니다 (verified + RLS)" role={me.role} name={me.name} />

      {error && <p className="mb-3 text-sm text-red-600">⚠ {error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--en-line)] bg-white p-8 text-center text-sm text-[var(--en-ink-soft)]">
          검수 대기 중인 문항이 없습니다. AI로 생성한 문항이 저장되면 여기에 나타납니다.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="rounded-xl border border-[var(--en-line)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--en-line)] px-4 py-3">
              <b className="text-sm">검수 대기 {items.length}건</b>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {Array.from(grouped.entries()).map(([groupKey, groupItems]) => (
                <div key={groupKey} className="border-b border-[var(--en-line)] last:border-b-0">
                  <div className="flex items-center justify-between bg-[#FAFBFE] px-4 py-2">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                      {groupKey} ({groupItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => approveGroup(groupItems)}
                      className="text-[11px] font-bold text-[var(--en-gold-deep)] hover:underline"
                    >
                      전체 승인
                    </button>
                  </div>
                  <ul>
                    {groupItems.map((it) => {
                      const busy = busyIds.has(it.id);
                      const label = catalogEntry(it.task_type)?.label ?? it.task_type;
                      return (
                        <li key={it.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(it.id)}
                            disabled={busy}
                            className={`block w-full px-4 py-2.5 text-left text-[13px] transition-colors disabled:opacity-50 ${
                              it.id === selectedId ? "bg-[var(--en-gold-soft)]" : "hover:bg-[#FAFBFE]"
                            }`}
                          >
                            <span className="block truncate font-semibold">{label}</span>
                            <span className="block truncate text-[11px] text-[var(--en-ink-soft)]">
                              {SOURCE_LABEL[it.source] ?? it.source} · {it.prompt.slice(0, 40)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {selected ? (
            <div className="rounded-xl border border-[var(--en-line)] bg-white p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-dashed border-[var(--en-line)] pb-4">
                <b className="text-[15px]">{catalogEntry(selected.task_type)?.label ?? selected.task_type}</b>
                <span className="rounded-md bg-[#EFF3FA] px-2 py-[3px] text-[11px] font-bold text-[var(--en-ink-soft)]">
                  {SOURCE_LABEL[selected.source] ?? selected.source}
                </span>
                <span className="text-[11px] text-[var(--en-ink-soft)]">
                  {modules.get(selected.module_id)?.formCode} · {new Date(selected.created_at).toLocaleString("ko-KR")}
                </span>
              </div>

              {selectedStimulus && (
                <div className="mb-4 rounded-lg bg-[#FAFBFE] p-4">
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                    {selectedStimulus.transcript ? "스크립트 (음성 원본)" : "지문"}
                    {selectedStimulus.title ? ` · ${selectedStimulus.title}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedStimulus.transcript ?? selectedStimulus.body}
                  </p>
                </div>
              )}

              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">문항</p>
              <p className="mb-4 whitespace-pre-wrap text-sm">{selected.prompt}</p>

              <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                내용(payload) · 검수용 원본
              </p>
              <pre className="mb-4 max-h-64 overflow-auto rounded-lg bg-[#0F1B2D] p-3 text-[12px] leading-relaxed text-[#DCE6F5]">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>

              {selected.answer_key != null && (
                <>
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">정답</p>
                  <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-[#0F1B2D] p-3 text-[12px] leading-relaxed text-[#DCE6F5]">
                    {JSON.stringify(selected.answer_key, null, 2)}
                  </pre>
                </>
              )}

              {selected.explanation_ko && (
                <>
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">해설</p>
                  <p className="mb-4 whitespace-pre-wrap text-sm text-[var(--en-ink-soft)]">{selected.explanation_ko}</p>
                </>
              )}

              <div className="flex items-center gap-2 border-t border-dashed border-[var(--en-line)] pt-4">
                <span className="mr-auto text-[12px] text-[var(--en-ink-soft)]">
                  ⚠ 승인해야만 학생에게 노출됩니다(문항 생성 화면에서 직접 수정하려면 반려 후 다시 등록하세요).
                </span>
                <button
                  type="button"
                  onClick={() => reject(selected.id)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full border border-[var(--en-line)] px-5 py-2 text-sm font-bold text-[var(--en-ink-soft)] hover:border-[var(--en-ink)] hover:text-[var(--en-ink)] disabled:opacity-50"
                >
                  반려(삭제)
                </button>
                <button
                  type="button"
                  onClick={() => approve(selected.id)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full bg-[var(--en-gold)] px-6 py-2 text-sm font-bold text-[var(--en-on-gold)] disabled:opacity-50"
                >
                  {busyIds.has(selected.id) ? "처리 중…" : "검수 완료 · 저장"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--en-line)] bg-white p-8 text-center text-sm text-[var(--en-ink-soft)]">
              왼쪽에서 문항을 선택하세요.
            </div>
          )}
        </div>
      )}
    </>
  );
}
