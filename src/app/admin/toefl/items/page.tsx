"use client";

// TOEFL P6: 관리자 문항 등록 화면(Reading/Listening 7개 유형). /admin/sat와 같은 흐름 —
// AI(Gemini)로 초안을 생성 → 이 화면에서 검토·수정 → 저장. Speaking/Writing 5개 유형은 다음 단계.
// docs/toefl-spec.md §6(데이터 계약)·§9(API)·§15(P6 DoD) 참고. [[toefl-ui-work-rules]] 8원칙 준수.

import { useEffect, useMemo, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import Pipeline from "@/components/toefl/admin/Pipeline";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";
import { GENERATABLE_TASKS } from "@/lib/toefl/task-catalog";
import type { ToeflSection, ToeflTaskType } from "@/lib/toefl/types";

// 유형 목록은 src/lib/toefl/task-catalog.ts 가 유일한 출처다 — 여기에 복제하지 않는다.
// (예전엔 이 파일이 같은 배열을 따로 들고 있어서, 유형 추가 때 두 곳을 고쳐야 했다)
type Section = ToeflSection;
type GenerableTaskType = ToeflTaskType;

const TASK_TYPES = GENERATABLE_TASKS.map((e) => ({
  value: e.taskType,
  label: e.label,
  section: e.section,
  needsStimulus: e.needsStimulus,
}));

type ModuleOption = {
  id: string;
  formTitle: string;
  formCode: string;
  blueprintVersion: string;
  section: Section;
  stage: string;
  route: string;
};

type OptionD = { id: string; text: string };
type BlankD = { id: string; masked: string; length: number; answer: string };
type ItemDraft = {
  include: boolean;
  paragraph?: string;
  blanks?: BlankD[];
  spoken_text?: string;
  prompt?: string;
  options?: OptionD[];
  correct?: string[];
  explanation_ko: string;
  skill_tags: string[];
};

type Progress = { taskMix: Record<string, number>; counts: Record<string, number> } | null;
type RegisteredItem = { id: string; task_type: string; prompt: string; is_active: boolean; position: number };

export default function AdminToeflItemsPage() {
  const me = useAdminMe();

  const [taskType, setTaskType] = useState<GenerableTaskType>("academic_passage");
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleId, setModuleId] = useState<string>("");
  const [itemsPerUnit, setItemsPerUnit] = useState(3);
  const [difficulty, setDifficulty] = useState(3);
  const [topic, setTopic] = useState("");

  const [stimulusTitle, setStimulusTitle] = useState("");
  const [stimulusText, setStimulusText] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([]);

  const [progress, setProgress] = useState<Progress>(null);
  const [registeredItems, setRegisteredItems] = useState<RegisteredItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [log, setLog] = useState<{ kind: string; status: string; message: string }[]>([]);

  const config = TASK_TYPES.find((t) => t.value === taskType)!;
  const filteredModules = useMemo(() => modules.filter((m) => m.section === config.section), [modules, config.section]);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: forms } = await supabase.from("toefl_form").select("id, code, title, blueprint_version");
      const { data: mods } = await supabase.from("toefl_module").select("id, form_id, section, stage, route");
      const formById = new Map((forms ?? []).map((f) => [f.id, f]));
      const opts: ModuleOption[] = (mods ?? [])
        .map((m) => {
          const f = formById.get(m.form_id);
          if (!f) return null;
          return {
            id: m.id,
            formTitle: f.title,
            formCode: f.code,
            blueprintVersion: f.blueprint_version,
            section: m.section as Section,
            stage: m.stage,
            route: m.route,
          };
        })
        .filter((m): m is ModuleOption => m !== null);
      setModules(opts);
    }
    init();
  }, []);

  // 유형이 바뀌면 그 섹션의 모듈로 다시 고른다.
  useEffect(() => {
    const first = modules.find((m) => m.section === config.section);
    setModuleId(first?.id ?? "");
  }, [taskType, modules, config.section]);

  useEffect(() => {
    if (!moduleId) { setProgress(null); setRegisteredItems([]); return; }
    loadProgress(moduleId);
    loadRegisteredItems(moduleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  async function loadProgress(mid: string) {
    const supabase = createClient();
    const mod = modules.find((m) => m.id === mid);
    if (!mod) { setProgress(null); return; }
    const { data: bp } = await supabase
      .from("toefl_form_blueprint")
      .select("task_mix")
      .eq("version", mod.blueprintVersion)
      .eq("section", mod.section)
      .eq("stage", mod.stage)
      .eq("route", mod.route)
      .maybeSingle();
    // 실제로 학생에게 뽑힐 수 있는 건 활성 문항뿐이라, 진행률은 활성 개수 기준으로 보여준다.
    const { data: existingItems } = await supabase.from("toefl_item").select("task_type").eq("module_id", mid).eq("is_active", true);
    const counts: Record<string, number> = {};
    for (const it of existingItems ?? []) counts[it.task_type] = (counts[it.task_type] ?? 0) + 1;
    const taskMix = { ...(bp?.task_mix as Record<string, number> | undefined) };
    delete taskMix.routing_threshold;
    setProgress({ taskMix, counts });
  }

  // 등록된 문항이 아무리 쌓여도 목록 자체는 module_id로 좁혀서 가져오므로 가볍다.
  // 다만 화면이 무한정 길어지지 않게 최근 200개까지만 보여준다.
  async function loadRegisteredItems(mid: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("toefl_item")
      .select("id, task_type, prompt, is_active, position")
      .eq("module_id", mid)
      .order("task_type")
      .order("position")
      .limit(200);
    setRegisteredItems((data ?? []) as RegisteredItem[]);
  }

  async function toggleActive(id: string, nextActive: boolean) {
    setRegisteredItems((prev) => prev.map((it) => (it.id === id ? { ...it, is_active: nextActive } : it)));
    const supabase = createClient();
    const { error: updateErr } = await supabase.from("toefl_item").update({ is_active: nextActive }).eq("id", id);
    if (updateErr) {
      setRegisteredItems((prev) => prev.map((it) => (it.id === id ? { ...it, is_active: !nextActive } : it)));
      setError(`활성 상태 변경 실패: ${updateErr.message}`);
      return;
    }
    if (moduleId) loadProgress(moduleId);
  }

  async function authHeader() {
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session.session?.access_token ?? ""}` };
  }

  async function handleGenerate() {
    setError(null); setMessage(null); setLog([]);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/toefl/items/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ taskType, itemsPerUnit, difficulty, topic }),
      });
      // 응답이 JSON이 아닐 수 있다 — 서버 함수가 타임아웃되거나 500으로 죽으면 본문이
      // 비거나 HTML이 온다. 그때 res.json()이 먼저 터져서 원인이 "생성 실패"로만 보였다.
      // 상태코드와 본문 앞부분을 함께 보여줘 원인을 화면에서 바로 알 수 있게 한다.
      type GenerateResponse = { ok?: boolean; message?: string; stimulus?: unknown; items?: unknown };
      const bodyText = await res.text();
      let data: GenerateResponse | null = null;
      try {
        data = JSON.parse(bodyText) as GenerateResponse;
      } catch {
        setGenerating(false);
        setError(
          bodyText.trim().length === 0
            ? `생성 실패 (HTTP ${res.status}) — 서버가 빈 응답을 보냈습니다. 개수를 줄여 다시 시도해 보세요(생성이 60초를 넘기면 함수가 중단됩니다).`
            : `생성 실패 (HTTP ${res.status}) — 응답이 JSON이 아닙니다: ${bodyText.slice(0, 200)}`
        );
        return;
      }
      setGenerating(false);
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? `생성 실패 (HTTP ${res.status})`);
        return;
      }

      // 유형마다 채워지는 칸이 달라 전부 optional 이다. 무엇이 필수인지는 저장 시
      // 서버의 생성기(toItemRow)가 판단하고, 비어 있는 문항만 건너뛴다.
      const stimulus = data.stimulus as { title: string; text: string } | null;
      const generated = data.items as {
        prompt?: string;
        options?: OptionD[];
        correct?: string[];
        paragraph?: string;
        blanks?: BlankD[];
        spoken_text?: string;
        explanation_ko: string;
        skill_tags: string[];
      }[];

      // 지문을 공유하는 유형이면 stimulus 가 오고, 아니면 null 이다.
      setStimulusTitle(stimulus?.title ?? "");
      setStimulusText(stimulus?.text ?? "");
      setItems(generated.map((it) => ({ include: true, ...it })));
      setMessage(`${generated.length}문항을 생성했습니다. 검토·수정 후 저장하세요.`);
    } catch (e) {
      setGenerating(false);
      setError(`생성 중 오류: ${(e as Error).message}`);
    }
  }

  function updateItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function updateOption(i: number, ci: number, text: string) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i ? { ...it, options: (it.options ?? []).map((o, oi) => (oi === ci ? { ...o, text } : o)) } : it
      )
    );
  }
  function updateBlank(i: number, bi: number, patch: Partial<BlankD>) {
    setItems((prev) =>
      prev.map((it, idx) =>
        idx === i ? { ...it, blanks: (it.blanks ?? []).map((b, bidx) => (bidx === bi ? { ...b, ...patch } : b)) } : it
      )
    );
  }

  async function handleSave() {
    setError(null); setMessage(null);
    const chosen = items.filter((it) => it.include);
    if (chosen.length === 0) { setError("저장할 문항이 없습니다."); return; }
    if (config.needsStimulus && !stimulusText.trim()) { setError("지문/스크립트 내용이 비어 있습니다."); return; }
    if (!moduleId) { setError("대상 모듈을 선택해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/toefl/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          moduleId,
          taskType,
          difficulty,
          stimulus: config.needsStimulus ? { title: stimulusTitle, text: stimulusText } : null,
          items: chosen,
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!res.ok || !data.ok) { setError(data.message ?? "저장 실패"); return; }
      setLog(data.log ?? []);
      setMessage(`${(data.itemIds ?? []).length}문항을 저장했습니다.`);
      setItems([]); setStimulusTitle(""); setStimulusText("");
      loadProgress(moduleId);
      loadRegisteredItems(moduleId);
    } catch (e) {
      setSaving(false);
      setError(`저장 중 오류: ${(e as Error).message}`);
    }
  }


  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Topbar
        title="문항 생성"
        crumb="생성물은 자동 저장되지 않습니다 — 검수 후 저장해야 노출"
        role={me.role}
        name={me.name}
      />
      <Pipeline here={["생성"]} />
      <div>
        <p className="text-[13px] text-[var(--en-ink-soft)]">
          AI가 원본 지문/스크립트와 객관식 문항을 생성합니다. <b>정답·해설을 반드시 검토</b>한 뒤 저장하세요.
          <br />
          Speaking·Writing 5개 유형은 아직 지원하지 않습니다.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-[var(--foreground)]">문항 유형</label>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as GenerableTaskType)} className={inputClass}>
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">대상 모듈</label>
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={inputClass}>
                {filteredModules.length === 0 && <option value="">(해당 섹션 모듈 없음)</option>}
                {filteredModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.formCode} — {m.section}/{m.stage}/{m.route}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {progress && (
            <div className="rounded-lg bg-[var(--pink-light)] p-3 text-xs text-[var(--secondary)]">
              <span className="font-medium text-[var(--foreground)]">이 모듈의 등록 현황(블루프린트 목표 대비): </span>
              {Object.entries(progress.taskMix).map(([tt, target]) => (
                <span key={tt} className="mr-3 inline-block">
                  {tt}: {progress.counts[tt] ?? 0}/{target}
                </span>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--foreground)]">
                {config.needsStimulus ? "지문당 문항 수" : "생성 개수"}
              </label>
              <select value={itemsPerUnit} onChange={(e) => setItemsPerUnit(Number(e.target.value))} className={inputClass}>
                {(config.needsStimulus ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 3, 5, 8, 10, 15, 20]).map((n) => (
                  <option key={n} value={n}>{n}개</option>
                ))}
              </select>
              {config.needsStimulus && (
                <p className="mt-1 text-xs text-[var(--secondary)]">지문 하나에 딸린 문항 수입니다. 더 필요하면 생성을 여러 번 반복해 지문을 늘리세요.</p>
              )}
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">난이도 (1~5)</label>
              <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} className={inputClass}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--foreground)]">주제 (선택)</label>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="예: biology, campus life" className={inputClass} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            onClick={handleGenerate}
            disabled={generating || !moduleId}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {generating ? "생성 중... (수십 초)" : "AI로 생성"}
          </button>
        </div>

        {moduleId && registeredItems.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-[var(--foreground)]">
              이 모듈에 등록된 문항 {registeredItems.length}개
            </h2>
            <p className="mt-1 text-xs text-[var(--secondary)]">
              끄면(비활성) 학생 응시 시 무작위 추출 대상에서 빠집니다 — 삭제되지는 않습니다.
            </p>
            <ul className="mt-3 divide-y divide-[var(--border-c)] rounded-2xl border border-[var(--border-c)] bg-white">
              {registeredItems.map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-36 shrink-0 truncate text-xs text-[var(--secondary)]">{it.task_type}</span>
                  <span className={`flex-1 truncate ${it.is_active ? "text-[var(--foreground)]" : "text-[var(--secondary)] line-through"}`}>
                    {it.prompt}
                  </span>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--secondary)]">
                    <input type="checkbox" checked={it.is_active} onChange={(e) => toggleActive(it.id, e.target.checked)} />
                    활성
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {items.length > 0 && (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[var(--foreground)]">생성된 문항 {items.length}개 (검토 후 저장)</h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[var(--mint)] px-6 py-2.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60"
              >
                {saving ? "저장 중..." : "선택 문항 저장"}
              </button>
            </div>

            {config.needsStimulus && (
              <div className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-5">
                <label className="block text-xs text-[var(--secondary)]">지문/스크립트 제목</label>
                <input type="text" value={stimulusTitle} onChange={(e) => setStimulusTitle(e.target.value)} className={inputClass} />
                <label className="mt-3 block text-xs text-[var(--secondary)]">
                  {config.section === "listening" ? "스크립트 (음성으로 변환됩니다)" : "지문 본문"}
                </label>
                <textarea rows={6} value={stimulusText} onChange={(e) => setStimulusText(e.target.value)} className={inputClass} />
              </div>
            )}

            <ul className="mt-4 space-y-4">
              {items.map((it, i) => (
                <li key={i} className={`rounded-2xl border bg-white p-5 ${it.include ? "border-[var(--border-c)]" : "border-[var(--border-c)] opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--secondary)]">{i + 1}번</span>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                      <input type="checkbox" checked={it.include} onChange={(e) => updateItem(i, { include: e.target.checked })} />
                      저장 포함
                    </label>
                  </div>

                  {taskType === "complete_the_words" && (
                    <>
                      <label className="mt-3 block text-xs text-[var(--secondary)]">문단 (빈칸은 _ 로 표시)</label>
                      <textarea rows={2} value={it.paragraph ?? ""} onChange={(e) => updateItem(i, { paragraph: e.target.value })} className={inputClass} />
                      <label className="mt-3 block text-xs text-[var(--secondary)]">빈칸 정답</label>
                      <div className="mt-1 space-y-2">
                        {(it.blanks ?? []).map((b, bi) => (
                          <div key={b.id} className="flex items-center gap-2 text-sm">
                            <span className="w-24 truncate text-[var(--secondary)]">{b.masked}</span>
                            <input
                              type="text"
                              value={b.answer}
                              onChange={(e) => updateBlank(i, bi, { answer: e.target.value })}
                              className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {taskType === "choose_a_response" && (
                    <>
                      <label className="mt-3 block text-xs text-[var(--secondary)]">들려줄 문장 (음성으로 변환됩니다)</label>
                      <textarea rows={2} value={it.spoken_text ?? ""} onChange={(e) => updateItem(i, { spoken_text: e.target.value })} className={inputClass} />
                      <OptionsEditor item={it} onCorrect={(id) => updateItem(i, { correct: [id] })} onOptionText={(ci, text) => updateOption(i, ci, text)} />
                    </>
                  )}

                  {(taskType === "daily_life" || taskType === "academic_passage" || taskType === "conversation" || taskType === "announcement" || taskType === "academic_talk") && (
                    <>
                      <label className="mt-3 block text-xs text-[var(--secondary)]">질문</label>
                      <textarea rows={2} value={it.prompt ?? ""} onChange={(e) => updateItem(i, { prompt: e.target.value })} className={inputClass} />
                      <OptionsEditor item={it} onCorrect={(id) => updateItem(i, { correct: [id] })} onOptionText={(ci, text) => updateOption(i, ci, text)} />
                    </>
                  )}

                  <label className="mt-3 block text-xs text-[var(--secondary)]">해설 (한국어)</label>
                  <textarea rows={2} value={it.explanation_ko} onChange={(e) => updateItem(i, { explanation_ko: e.target.value })} className={inputClass} />
                </li>
              ))}
            </ul>
          </>
        )}

        {log.length > 0 && (
          <ul className="mt-6 space-y-1 text-sm">
            {log.map((l, i) => (
              <li key={i} className={l.status === "error" ? "text-red-600" : "text-[var(--secondary)]"}>
                [{l.kind}] {l.status}: {l.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function OptionsEditor({
  item,
  onCorrect,
  onOptionText,
}: {
  item: ItemDraft;
  onCorrect: (id: string) => void;
  onOptionText: (ci: number, text: string) => void;
}) {
  return (
    <>
      <label className="mt-3 block text-xs text-[var(--secondary)]">보기 (정답을 라디오로 선택)</label>
      <div className="mt-1 space-y-2">
        {(item.options ?? []).map((o, ci) => (
          <div key={o.id} className="flex items-center gap-2">
            <input type="radio" checked={(item.correct ?? [])[0] === o.id} onChange={() => onCorrect(o.id)} title="정답으로 지정" />
            <span className="w-5 text-sm font-medium text-[var(--secondary)]">{o.id}</span>
            <input
              type="text"
              value={o.text}
              onChange={(e) => onOptionText(ci, e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
            />
          </div>
        ))}
      </div>
    </>
  );
}
