"use client";

// TOEFL 중복 검토 화면. [[toefl-item-pipeline-project]] Phase 4.
//
// Phase 3(임베딩 기반 중복검사, scripts/toefl/dedup-batch.ts)가 dedup_status='near_duplicate'로
// 플래그만 걸어둔 문항을 사람이 최종 판단하는 곳이다 — duplicate(임계값 0.99 이상)는 이미
// 자동으로 is_active=false 처리됐지만, near_duplicate는 안전을 위해 아무것도 안 건드리고
// 계속 노출된 상태로 둔다(2026-08-31 실측: 0.95 임계값이 "같은 주제 재사용, 다른 지문"까지
// 자동으로 지울 뻔했다 — 그래서 사람 확인 없이는 절대 안 지운다).
//
// /admin/toefl/review(검수 큐)는 verified=false만 보여준다 — near_duplicate 플래그의
// 대부분(실측 100/120)은 이미 verified=true로 학생에게 노출 중인 문항이라 그 화면에
// 안 걸린다. 그래서 verified 여부와 무관하게 dedup_status만으로 걸러오는 별도 화면이 필요하다.

import { useCallback, useEffect, useMemo, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { catalogEntry } from "@/lib/toefl/task-catalog";
import { moduleLabel } from "@/lib/toefl/admin-labels";

type FlaggedItem = {
  id: string;
  module_id: string;
  stimulus_id: string | null;
  task_type: string;
  prompt: string;
  payload: unknown;
  verified: boolean;
  is_active: boolean;
  duplicate_of: string | null;
  created_at: string;
};

type MatchItem = { id: string; prompt: string; payload: unknown; stimulus_id: string | null; verified: boolean };
type ModuleInfo = { id: string; section: string; stage: string; route: string; formCode: string };
type StimulusInfo = { id: string; title: string | null; body: string | null; transcript: string | null };

export default function ToeflDedupPage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FlaggedItem[]>([]);
  const [matches, setMatches] = useState<Map<string, MatchItem>>(new Map());
  const [modules, setModules] = useState<Map<string, ModuleInfo>>(new Map());
  const [stimuli, setStimuli] = useState<Map<string, StimulusInfo>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: flagged, error: itemsErr } = await supabase
      .from("toefl_item")
      .select("id, module_id, stimulus_id, task_type, prompt, payload, verified, is_active, duplicate_of, created_at")
      .eq("dedup_status", "near_duplicate")
      .order("created_at", { ascending: false })
      .limit(300);
    if (itemsErr) {
      setError(`불러오기 실패: ${itemsErr.message}`);
      setLoading(false);
      return;
    }
    const rows = (flagged ?? []) as FlaggedItem[];

    const matchIds = Array.from(new Set(rows.map((r) => r.duplicate_of).filter((v): v is string => !!v)));
    const moduleIds = Array.from(new Set(rows.map((r) => r.module_id)));

    const [{ data: matchRows }, { data: mods }] = await Promise.all([
      matchIds.length
        ? supabase.from("toefl_item").select("id, prompt, payload, stimulus_id, verified").in("id", matchIds)
        : Promise.resolve({ data: [] as MatchItem[] }),
      moduleIds.length
        ? supabase.from("toefl_module").select("id, form_id, section, stage, route").in("id", moduleIds)
        : Promise.resolve({ data: [] as { id: string; form_id: string; section: string; stage: string; route: string }[] }),
    ]);

    const formIds = Array.from(new Set((mods ?? []).map((m) => m.form_id)));
    const { data: forms } = formIds.length
      ? await supabase.from("toefl_form").select("id, code").in("id", formIds)
      : { data: [] as { id: string; code: string }[] };
    const formById = new Map((forms ?? []).map((f) => [f.id, f]));
    const moduleMap = new Map<string, ModuleInfo>();
    for (const m of mods ?? []) {
      moduleMap.set(m.id, { id: m.id, section: m.section, stage: m.stage, route: m.route, formCode: formById.get(m.form_id)?.code ?? "?" });
    }
    setModules(moduleMap);
    setMatches(new Map((matchRows ?? []).map((m) => [m.id, m as MatchItem])));

    const stimulusIds = Array.from(
      new Set([...rows.map((r) => r.stimulus_id), ...(matchRows ?? []).map((m) => (m as MatchItem).stimulus_id)].filter((v): v is string => !!v))
    );
    const { data: stims } = stimulusIds.length
      ? await supabase.from("toefl_stimulus").select("id, title, body, transcript").in("id", stimulusIds)
      : { data: [] as StimulusInfo[] };
    setStimuli(new Map((stims ?? []).map((s) => [s.id, s as StimulusInfo])));

    setItems(rows);
    setSelectedId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null)));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, FlaggedItem[]>();
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
  const selectedMatch = selected?.duplicate_of ? (matches.get(selected.duplicate_of) ?? null) : null;
  const selectedStimulus = selected?.stimulus_id ? (stimuli.get(selected.stimulus_id) ?? null) : null;
  const matchStimulus = selectedMatch?.stimulus_id ? (stimuli.get(selectedMatch.stimulus_id) ?? null) : null;

  function withBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function clearFlag(item: FlaggedItem) {
    setError(null);
    withBusy(item.id, true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.from("toefl_item").update({ dedup_status: "unique", duplicate_of: null }).eq("id", item.id);
    withBusy(item.id, false);
    if (updateErr) {
      setError(`처리 실패: ${updateErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
  }

  async function deactivate(item: FlaggedItem) {
    if (!confirm("이 문항을 비활성화합니다 — 학생에게 더 이상 노출되지 않습니다. 계속할까요?")) return;
    setError(null);
    withBusy(item.id, true);
    const supabase = createClient();
    const { error: updateErr } = await supabase.from("toefl_item").update({ is_active: false, dedup_status: "duplicate" }).eq("id", item.id);
    withBusy(item.id, false);
    if (updateErr) {
      setError(`처리 실패: ${updateErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
  }

  return (
    <>
      <Topbar title="중복 검토" crumb="비슷한 문항끼리 자동으로 묶어둔 것 — 사람이 확인 후 처리" role={me.role} name={me.name} />

      {error && <p className="mb-3 text-sm text-red-600">⚠ {error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--en-line)] bg-white p-8 text-center text-sm text-[var(--en-ink-soft)]">
          확인이 필요한 유사 문항이 없습니다.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <div className="rounded-xl border border-[var(--en-line)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--en-line)] px-4 py-3">
              <b className="text-sm">확인 대기 {items.length}건</b>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {Array.from(grouped.entries()).map(([groupKey, groupItems]) => (
                <div key={groupKey} className="border-b border-[var(--en-line)] last:border-b-0">
                  <div className="bg-[#FAFBFE] px-4 py-2">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                      {groupKey} ({groupItems.length})
                    </span>
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
                            <span className="flex items-center gap-1.5 truncate font-semibold">
                              {it.verified && (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">노출중</span>
                              )}
                              {label}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--en-ink-soft)]">{it.prompt.slice(0, 40)}</span>
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
                {selected.verified && (
                  <span className="rounded-md bg-sky-100 px-2 py-[3px] text-[11px] font-bold text-sky-700">현재 학생에게 노출 중</span>
                )}
                <span className="text-[11px] text-[var(--en-ink-soft)]">
                  {modules.get(selected.module_id)?.formCode} · {new Date(selected.created_at).toLocaleString("ko-KR")}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--en-line)] p-4">
                  <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">이 문항</p>
                  {selectedStimulus && (
                    <p className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--en-ink-soft)]">
                      {selectedStimulus.title && <b className="mr-1">{selectedStimulus.title}</b>}
                      {selectedStimulus.transcript ?? selectedStimulus.body}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-sm">{selected.prompt}</p>
                </div>
                <div className="rounded-lg border border-dashed border-[var(--en-line)] p-4">
                  <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                    비슷하다고 판단된 문항{selectedMatch?.verified ? " (노출 중)" : ""}
                  </p>
                  {selectedMatch ? (
                    <>
                      {matchStimulus && (
                        <p className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--en-ink-soft)]">
                          {matchStimulus.title && <b className="mr-1">{matchStimulus.title}</b>}
                          {matchStimulus.transcript ?? matchStimulus.body}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-sm">{selectedMatch.prompt}</p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--en-ink-soft)]">(비교 대상 문항을 찾을 수 없습니다 — 이후 삭제되었을 수 있습니다)</p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2">
                <span className="mr-auto text-[12px] text-[var(--en-ink-soft)]">
                  둘 다 괜찮은 별개 문항이면 정상 처리, 실질적으로 같은 내용이면 비활성화하세요.
                </span>
                <button
                  type="button"
                  onClick={() => deactivate(selected)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full border border-[var(--en-line)] px-4 py-2 text-sm font-bold text-red-600 hover:border-red-400 disabled:opacity-50"
                >
                  비활성화(중복 처리)
                </button>
                <button
                  type="button"
                  onClick={() => clearFlag(selected)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full bg-[var(--en-gold)] px-6 py-2 text-sm font-bold text-[var(--en-on-gold)] disabled:opacity-50"
                >
                  {busyIds.has(selected.id) ? "처리 중…" : "정상으로 처리"}
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
