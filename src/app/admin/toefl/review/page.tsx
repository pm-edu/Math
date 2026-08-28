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
import { useRouter } from "next/navigation";
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
  ai_review_status: string | null;
  ai_review_note: string | null;
};

type ModuleInfo = { id: string; section: string; stage: string; route: string; formCode: string; formTitle: string };
type StimulusInfo = { id: string; title: string | null; body: string | null; transcript: string | null };

const SOURCE_LABEL: Record<string, string> = { ai: "AI 생성", manual: "직접 등록", seed: "시드 데이터" };

export default function ToeflReviewPage() {
  const me = useAdminMe();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [modules, setModules] = useState<Map<string, ModuleInfo>>(new Map());
  const [stimuli, setStimuli] = useState<Map<string, StimulusInfo>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // 화면 검토(2026-08-27) [B]: 반려 사유를 문항마다 따로 든다.
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  // 3차 화면 검토(2026-08-27) [C]-3: 문항은 삭제되지만 반려 사유는 toefl_item_rejection에
  // 남긴다(마이그레이션 202608272000) — 여기서 최근 것부터 불러와 보여준다.
  const [rejectionLog, setRejectionLog] = useState<
    { moduleId: string; taskType: string; prompt: string; reason: string; createdAt: string }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: draftItems, error: itemsErr } = await supabase
      .from("toefl_item")
      .select("id, module_id, stimulus_id, task_type, prompt, payload, answer_key, explanation_ko, source, created_at, ai_review_status, ai_review_note")
      .eq("verified", false)
      // AI 자동심사(2026-08-28, [[toefl-item-pipeline-project]] 부록 A-1)에서 fail 판정을
      // 받은 문항은 기본 검수 큐에서 뺀다 — 손볼 곳이 명확해 사람이 여기서 볼 필요가 없다.
      // NULL(아직 AI심사 안 됨)은 계속 보여야 하므로 neq 대신 or로 명시한다(neq는 NULL을
      // 자동으로 걸러버려서 미심사 문항까지 같이 사라지는 실수를 피하기 위함).
      .or("ai_review_status.is.null,ai_review_status.neq.fail")
      .order("created_at", { ascending: false })
      .limit(300);
    if (itemsErr) {
      setError(`불러오기 실패: ${itemsErr.message}`);
      setLoading(false);
      return;
    }
    // flag(AI가 애매하다고 판단한 것)를 맨 위로 — 사람 검수 우선순위 상단(지시서 A-1 요구사항).
    const rows = ((draftItems ?? []) as DraftItem[]).sort((a, b) => {
      const aFlag = a.ai_review_status === "flag" ? 0 : 1;
      const bFlag = b.ai_review_status === "flag" ? 0 : 1;
      return aFlag - bFlag;
    });

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

    const { data: rejections } = await supabase
      .from("toefl_item_rejection")
      .select("module_id, task_type, prompt_snapshot, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setRejectionLog(
      (rejections ?? []).map((r) => ({
        moduleId: r.module_id as string,
        taskType: r.task_type as string,
        prompt: r.prompt_snapshot as string,
        reason: r.reason as string,
        createdAt: r.created_at as string,
      }))
    );
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

  async function reject(item: DraftItem, redirectToRegenerate: boolean) {
    setError(null);
    const reason = (rejectReasons[item.id] ?? "").trim();
    if (!reason) {
      setError("반려 사유를 입력해 주세요.");
      return;
    }
    // 3차 화면 검토(2026-08-27) [C]-3: 삭제 전 영향범위를 명확히 알린다 — 이 문항은
    // verified=false라 toefl_item_public에서 애초에 걸러지므로 학생에게 노출된 적이 없다
    // (영향 없음). "되돌릴 수 없음"만 강조하면 되고, attempts 폐기처럼 "재응시 가능" 문구는
    // 여기엔 안 맞아서 그대로 안 씀.
    if (
      !confirm(
        `이 문항을 반려(삭제)합니다.\n사유: ${reason}\n\n` +
          `⚠ 복구 불가 — 삭제 후 되돌릴 수 없습니다.\n` +
          `학생 영향: 없음 (검수 전 초안이라 지금까지 어떤 학생에게도 노출된 적이 없습니다.)\n\n` +
          `계속할까요?`
      )
    )
      return;
    withBusy(item.id, true);
    const supabase = createClient();
    // 반려 사유는 문항이 지워져도 남아야 하므로(요청) 삭제 전에 먼저 로그를 남긴다 —
    // 로그 저장이 실패하면 사유를 잃을 수 있으니 그 경우 삭제 자체를 하지 않는다.
    const { error: logErr } = await supabase.from("toefl_item_rejection").insert({
      module_id: item.module_id,
      task_type: item.task_type,
      prompt_snapshot: item.prompt,
      reason,
      rejected_by: me.id,
    });
    if (logErr) {
      withBusy(item.id, false);
      setError(`반려 사유 저장 실패(삭제 취소됨): ${logErr.message}`);
      return;
    }
    const { error: deleteErr } = await supabase.from("toefl_item").delete().eq("id", item.id);
    withBusy(item.id, false);
    if (deleteErr) {
      setError(`반려 실패: ${deleteErr.message}`);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    setRejectionLog((prev) => [
      { moduleId: item.module_id, taskType: item.task_type, prompt: item.prompt, reason, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    if (redirectToRegenerate) {
      const mod = modules.get(item.module_id);
      const params = new URLSearchParams({ taskType: item.task_type });
      if (mod) params.set("moduleId", item.module_id);
      router.push(`/admin/toefl/items?${params.toString()}`);
    }
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
                            <span className="flex items-center gap-1.5 truncate font-semibold">
                              {it.ai_review_status === "flag" && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                  ⚠ AI 확인요청
                                </span>
                              )}
                              {label}
                            </span>
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

              {selected.ai_review_status === "flag" && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <b className="mr-1">⚠ AI 자동심사가 확인을 요청했습니다:</b>
                  {selected.ai_review_note}
                </div>
              )}

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

              <div className="border-t border-dashed border-[var(--en-line)] pt-4">
                <label className="block text-xs">
                  <span className="mb-1 block font-semibold text-[var(--en-ink-soft)]">반려 사유(반려 시 필수)</span>
                  <textarea
                    rows={2}
                    value={rejectReasons[selected.id] ?? ""}
                    onChange={(e) => setRejectReasons((prev) => ({ ...prev, [selected.id]: e.target.value }))}
                    placeholder="예: 정답이 지문 내용과 안 맞음 / 난이도가 목표보다 낮음"
                    className="w-full rounded-lg border border-[var(--en-line)] px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="mr-auto text-[12px] text-[var(--en-ink-soft)]">
                  ⚠ 승인해야만 학생에게 노출됩니다.
                </span>
                <button
                  type="button"
                  onClick={() => reject(selected, false)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full border border-[var(--en-line)] px-4 py-2 text-sm font-bold text-[var(--en-ink-soft)] hover:border-[var(--en-ink)] hover:text-[var(--en-ink)] disabled:opacity-50"
                >
                  반려 · 삭제만
                </button>
                <button
                  type="button"
                  onClick={() => reject(selected, true)}
                  disabled={busyIds.has(selected.id)}
                  className="rounded-full border border-[var(--en-line)] px-4 py-2 text-sm font-bold text-[var(--en-ink-soft)] hover:border-[var(--en-ink)] hover:text-[var(--en-ink)] disabled:opacity-50"
                >
                  반려 · 재생성하러 가기
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

      {rejectionLog.length > 0 && (
        <details className="mt-6 rounded-xl border border-[var(--en-line)] bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--en-ink-soft)]">
            최근 반려 이력 ({rejectionLog.length}건)
          </summary>
          <ul className="divide-y divide-[var(--en-line)] border-t border-[var(--en-line)]">
            {rejectionLog.map((r, i) => (
              <li key={i} className="px-4 py-3 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2">
                  <b>{catalogEntry(r.taskType)?.label ?? r.taskType}</b>
                  <span className="text-[var(--en-ink-soft)]">{new Date(r.createdAt).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-0.5 truncate text-[var(--en-ink-soft)]">{r.prompt}</p>
                <p className="mt-0.5 text-red-700">사유: {r.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
