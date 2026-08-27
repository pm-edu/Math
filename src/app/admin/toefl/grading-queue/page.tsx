"use client";

// AI 채점 대기 큐. docs/toefl-spec.md §12 "모든 AI 호출은 재시도 2회 + 실패 시
// status='pending_manual'로 남기고 관리자 큐에 노출" — 이 화면이 그 큐다.
//
// 2026-08-27 교차검증(A5) 전까지는 toefl_ai_score에 status 컬럼 자체가 없어서 이 화면도,
// 실패 기록 자체도 없었다(그냥 조용히 0점으로 남았음). 이제 실패하면 status='pending_manual'
// 행이 남고(grade-response.ts), 여기서 재시도할 수 있다.

import { useCallback, useEffect, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { catalogEntry } from "@/lib/toefl/task-catalog";

type QueueRow = {
  scoreId: string;
  responseId: string;
  attemptId: string;
  reason: string;
  createdAt: string;
  taskType: string;
  prompt: string;
  answerText: string | null;
  hasAudio: boolean;
  studentName: string;
  studentEmail: string | null;
  formCode: string;
};

const ESSAY_TYPES = new Set(["write_an_email", "academic_discussion"]);

const ESSAY_DIMENSIONS: { key: string; label: string }[] = [
  { key: "task_achievement", label: "과제 달성" },
  { key: "coherence", label: "구성·응집성" },
  { key: "lexical_resource", label: "어휘" },
  { key: "grammar", label: "문법" },
];

const INTERVIEW_DIMENSIONS: { key: string; label: string }[] = [
  { key: "delivery", label: "전달력" },
  { key: "language_use", label: "언어 사용" },
  { key: "topic_development", label: "내용 전개" },
];

function rubricDimensions(taskType: string) {
  return ESSAY_TYPES.has(taskType) ? ESSAY_DIMENSIONS : INTERVIEW_DIMENSIONS;
}

export default function ToeflGradingQueuePage() {
  const me = useAdminMe();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // 화면 검토(2026-08-27) [B]: "다시 시도"(AI 재시도)와 별개로, 관리자가 루브릭 항목별 점수를
  // 직접 입력해 채점을 확정하는 수동 채점 폼 — scoreId별로 펼침/입력값/제출결과를 따로 든다.
  const [openId, setOpenId] = useState<string | null>(null);
  const [rubricDrafts, setRubricDrafts] = useState<Record<string, Record<string, number>>>({});
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  // 3차 화면 검토(2026-08-27) [C]-5: "확정 후" 배너에 재계산된 영역점수·밴드까지 보여준다.
  const [graded, setGraded] = useState<
    Record<
      string,
      {
        attemptId: string;
        section: { rawScore: number; scaledScore: number; band: number };
        overall: { totalScaled: number; overallBand: number } | null;
      }
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: scores, error: scoresErr } = await supabase
      .from("toefl_ai_score")
      .select("id, response_id, feedback_ko, created_at")
      .eq("status", "pending_manual")
      .order("created_at", { ascending: false })
      .limit(100);
    if (scoresErr) {
      setError(`불러오기 실패: ${scoresErr.message}`);
      setLoading(false);
      return;
    }
    const scoreRows = scores ?? [];
    if (scoreRows.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const responseIds = scoreRows.map((s) => s.response_id);
    const { data: responses } = await supabase
      .from("toefl_response")
      .select("id, attempt_id, item_id, answer, audio_path")
      .in("id", responseIds);
    const responseById = new Map((responses ?? []).map((r) => [r.id, r]));

    const itemIds = Array.from(new Set((responses ?? []).map((r) => r.item_id)));
    const attemptIds = Array.from(new Set((responses ?? []).map((r) => r.attempt_id)));

    const [{ data: items }, { data: attempts }] = await Promise.all([
      itemIds.length
        ? supabase.from("toefl_item").select("id, task_type, prompt").in("id", itemIds)
        : Promise.resolve({ data: [] as { id: string; task_type: string; prompt: string }[] }),
      attemptIds.length
        ? supabase.from("toefl_attempt").select("id, user_id, form_id").in("id", attemptIds)
        : Promise.resolve({ data: [] as { id: string; user_id: string; form_id: string }[] }),
    ]);
    const itemById = new Map((items ?? []).map((i) => [i.id, i]));
    const attemptById = new Map((attempts ?? []).map((a) => [a.id, a]));

    const userIds = Array.from(new Set((attempts ?? []).map((a) => a.user_id)));
    const formIds = Array.from(new Set((attempts ?? []).map((a) => a.form_id)));
    const [{ data: profiles }, { data: forms }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, name, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null }[] }),
      formIds.length
        ? supabase.from("toefl_form").select("id, code").in("id", formIds)
        : Promise.resolve({ data: [] as { id: string; code: string }[] }),
    ]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const formById = new Map((forms ?? []).map((f) => [f.id, f]));

    setRows(
      scoreRows
        .map((s) => {
          const response = responseById.get(s.response_id);
          if (!response) return null;
          const item = itemById.get(response.item_id);
          const attempt = attemptById.get(response.attempt_id);
          const profile = attempt ? profileById.get(attempt.user_id) : undefined;
          const form = attempt ? formById.get(attempt.form_id) : undefined;
          return {
            scoreId: s.id,
            responseId: s.response_id,
            attemptId: response.attempt_id,
            reason: s.feedback_ko,
            createdAt: s.created_at,
            taskType: item?.task_type ?? "?",
            prompt: item?.prompt ?? "",
            answerText: (response.answer as { text?: string } | null)?.text ?? null,
            hasAudio: !!response.audio_path,
            studentName: profile?.name || "이름 없음",
            studentEmail: profile?.email ?? null,
            formCode: form?.code ?? "(삭제된 폼)",
          } satisfies QueueRow;
        })
        .filter((r): r is QueueRow => r !== null)
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function authHeader() {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session.session?.access_token ?? ""}` };
  }

  async function retry(responseId: string) {
    setError(null);
    setBusyIds((prev) => new Set(prev).add(responseId));
    try {
      const res = await fetch("/api/admin/toefl/regrade", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ responseId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? `재시도 실패 (HTTP ${res.status})`);
        return;
      }
      if (data.warning) {
        setError(`재시도했지만 다시 실패했습니다: ${data.warning}`);
      }
      await load();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(responseId);
        return next;
      });
    }
  }

  function openManualGrade(row: QueueRow) {
    setOpenId((prev) => (prev === row.scoreId ? null : row.scoreId));
    if (!rubricDrafts[row.scoreId]) {
      const dims = rubricDimensions(row.taskType);
      setRubricDrafts((prev) => ({ ...prev, [row.scoreId]: Object.fromEntries(dims.map((d) => [d.key, 3])) }));
    }
  }

  function setDimension(scoreId: string, key: string, value: number) {
    setRubricDrafts((prev) => ({ ...prev, [scoreId]: { ...prev[scoreId], [key]: value } }));
  }

  async function submitManualGrade(row: QueueRow) {
    setError(null);
    const rubric = rubricDrafts[row.scoreId];
    const feedback = (feedbackDrafts[row.scoreId] ?? "").trim();
    if (!feedback) {
      setError("피드백을 입력해 주세요.");
      return;
    }
    setBusyIds((prev) => new Set(prev).add(row.responseId));
    try {
      const res = await fetch("/api/admin/toefl/grade-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ scoreId: row.scoreId, rubric, feedback }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? `채점 저장 실패 (HTTP ${res.status})`);
        return;
      }
      setGraded((prev) => ({
        ...prev,
        [row.scoreId]: { attemptId: data.attemptId, section: data.section, overall: data.overall },
      }));
      setRows((prev) => prev.filter((r) => r.scoreId !== row.scoreId));
      setOpenId(null);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(row.responseId);
        return next;
      });
    }
  }

  return (
    <>
      <Topbar title="AI 채점 대기" crumb="자동 채점이 실패해 관리자 확인이 필요한 응답" role={me.role} name={me.name} />

      {error && <p className="mb-3 text-sm text-red-600">⚠ {error}</p>}

      {Object.entries(graded).length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {Object.entries(graded).map(([scoreId, g]) => (
            <li key={scoreId} className="rounded-lg bg-[#E7F6EE] px-4 py-2.5 text-sm text-[#1C7A4B]">
              ✓ 채점 확정 — 영역 밴드 {g.section.band.toFixed(1)}(스케일 {g.section.scaledScore}/30)
              {g.overall && <> · 종합 밴드 {g.overall.overallBand.toFixed(1)}</>}
              {" — "}
              <a href={`/toefl/report/${g.attemptId}`} target="_blank" rel="noreferrer" className="font-bold underline">
                리포트 보기
              </a>
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <p className="text-sm text-[var(--en-ink-soft)]">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-[var(--en-line)] bg-white p-8 text-center text-sm text-[var(--en-ink-soft)]">
          대기 중인 항목이 없습니다. AI 채점이 재시도까지 전부 실패하면 여기에 나타납니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const busy = busyIds.has(r.responseId);
            return (
              <li key={r.scoreId} className="rounded-xl border border-[var(--en-line)] bg-white p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <b className="text-sm">{catalogEntry(r.taskType)?.label ?? r.taskType}</b>
                  <span className="rounded-md bg-[#EFF3FA] px-2 py-[3px] text-[11px] font-bold text-[var(--en-ink-soft)]">
                    {r.formCode}
                  </span>
                  <span className="text-[11px] text-[var(--en-ink-soft)]">
                    {r.studentName} · {r.studentEmail ?? "이메일 없음"} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p className="mb-2 text-sm text-[var(--en-ink-soft)]">{r.prompt}</p>
                {r.answerText && (
                  <p className="mb-2 whitespace-pre-wrap rounded-lg bg-[#FAFBFE] p-3 text-sm">{r.answerText}</p>
                )}
                {r.hasAudio && !r.answerText && (
                  <p className="mb-2 text-sm text-[var(--en-ink-soft)]">🎙 녹음 응답 (재생은 아직 이 화면에서 지원하지 않습니다)</p>
                )}
                <p className="mb-3 text-[12px] text-red-600">실패 사유: {r.reason}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => retry(r.responseId)}
                    disabled={busy}
                    className="rounded-full bg-[var(--en-gold)] px-5 py-2 text-sm font-bold text-[var(--en-on-gold)] disabled:opacity-50"
                  >
                    {busy ? "재시도 중…" : "AI 다시 시도"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openManualGrade(r)}
                    disabled={busy}
                    className="rounded-full border border-[var(--en-line)] px-5 py-2 text-sm font-bold text-[var(--en-ink)] hover:border-[var(--en-ink)] disabled:opacity-50"
                  >
                    수동 채점
                  </button>
                </div>

                {openId === r.scoreId && (
                  <div className="mt-4 rounded-lg border border-dashed border-[var(--en-line)] bg-[#FAFBFE] p-4">
                    <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[.04em] text-[var(--en-ink-soft)]">
                      루브릭 항목별 점수(0~6)
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {rubricDimensions(r.taskType).map((dim) => (
                        <label key={dim.key} className="text-xs">
                          <span className="mb-1 block font-semibold text-[var(--en-ink)]">{dim.label}</span>
                          <input
                            type="number"
                            min={0}
                            max={6}
                            step={0.5}
                            value={rubricDrafts[r.scoreId]?.[dim.key] ?? 3}
                            onChange={(e) => setDimension(r.scoreId, dim.key, Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--en-line)] px-3 py-1.5 text-sm"
                          />
                        </label>
                      ))}
                    </div>
                    <label className="mt-3 block text-xs">
                      <span className="mb-1 block font-semibold text-[var(--en-ink)]">피드백(학생에게 그대로 노출됩니다)</span>
                      <textarea
                        rows={3}
                        value={feedbackDrafts[r.scoreId] ?? ""}
                        onChange={(e) => setFeedbackDrafts((prev) => ({ ...prev, [r.scoreId]: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--en-line)] px-3 py-2 text-sm"
                      />
                    </label>
                    <p className="mt-2 text-[11px] text-[var(--en-ink-soft)]">
                      종합 밴드는 위 항목 점수의 평균을 0.5 단위로 반올림해 자동 계산됩니다.
                    </p>
                    <button
                      type="button"
                      onClick={() => submitManualGrade(r)}
                      disabled={busy}
                      className="mt-3 rounded-full bg-[var(--en-ink)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy ? "저장 중…" : "채점 확정"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
