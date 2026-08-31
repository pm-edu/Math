import type { SupabaseClient } from "@supabase/supabase-js";
import { getGenerator } from "./generators/registry";
import type { ItemDraft } from "./generators/types";

// 블루프린트가 요구하는 수와 실제 등록된 수를 맞대어 "무엇을 몇 개 더 만들지" 목록을 낸다.
// 원래 scripts/toefl-generate.ts 안에 있던 함수를 그대로 뽑아왔다(2026-08-28, TOEFL 문항
// 파이프라인 Phase 2 — Batch API 대량생성 스크립트도 같은 계산이 필요해져서 공유). `sets`
// 배수를 추가한 것 말고는 동작이 완전히 같다(sets 생략 시 1 — 기존 CLI와 100% 동일 결과).
//
// task_mix는 모듈(section+stage+route)별로 다르므로(Reading/Listening은 stage2에서
// easy/hard가 완전히 별개 풀), 이 함수가 toefl_module 실제 행을 순회하는 것만으로 이미
// easy/hard 분리가 정확히 반영된다 — 별도로 "103 대 143" 같은 걸 손으로 계산할 필요가 없다.

export type Shortfall = {
  moduleId: string;
  section: string;
  stage: string;
  route: string;
  taskType: string;
  need: number;
};

export async function findShortfalls(
  db: SupabaseClient,
  args: { form: string; section?: string; taskType?: string; sets?: number }
): Promise<Shortfall[]> {
  const sets = args.sets ?? 1;

  const { data: form } = await db
    .from("toefl_form")
    .select("id, code, blueprint_version")
    .eq("code", args.form)
    .maybeSingle();
  if (!form) {
    throw new Error(`폼을 찾지 못했습니다: ${args.form}`);
  }

  const [{ data: blueprint }, { data: modules }] = await Promise.all([
    db.from("toefl_form_blueprint").select("section, stage, route, task_mix").eq("version", form.blueprint_version).eq("is_active", true),
    db.from("toefl_module").select("id, section, stage, route").eq("form_id", form.id),
  ]);

  const out: Shortfall[] = [];
  for (const m of modules ?? []) {
    if (args.section && m.section !== args.section) continue;
    const bp = (blueprint ?? []).find((b) => b.section === m.section && b.stage === m.stage && b.route === m.route);
    if (!bp) continue;

    const { data: existing } = await db
      .from("toefl_item")
      .select("task_type")
      .eq("module_id", m.id)
      .eq("is_active", true);
    const counts: Record<string, number> = {};
    for (const it of existing ?? []) counts[it.task_type] = (counts[it.task_type] ?? 0) + 1;

    for (const [taskType, required] of Object.entries(bp.task_mix as Record<string, number>)) {
      // task_mix 에는 routing_threshold 같은 설정값도 섞여 있다 — 생성기가 있는 유형만 만든다.
      if (!getGenerator(taskType)) continue;
      if (args.taskType && taskType !== args.taskType) continue;
      const need = Number(required) * sets - (counts[taskType] ?? 0);
      if (need > 0) out.push({ moduleId: m.id, section: m.section, stage: m.stage, route: m.route, taskType, need });
    }
  }
  return out;
}

/**
 * 지문이 필요한 유형은 지문 1개 + 문항 N개를 함께 저장한다. 원래 scripts/toefl-generate.ts
 * 안에 있던 함수를 그대로 뽑아왔다 — Gemini/Ollama 단건 호출 경로와 Batch API 대량생성
 * 경로가 저장 규칙(verified=false, source='ai', position 이어붙이기)을 어긋나지 않게
 * 하나만 두고 같이 쓴다. `batchId`를 넘기면(신규, 기존 CLI는 안 넘김) 저장되는 모든
 * 문항에 그 값이 찍힌다 — 어느 생성 배치에서 나왔는지 나중에 추적하기 위함.
 */
export async function saveShortfallBatch(
  db: SupabaseClient,
  shortfall: Shortfall,
  stimulus: { title: string; text: string } | null,
  drafts: ItemDraft[],
  difficulty: number,
  options: { batchId?: string } = {}
): Promise<{ saved: number; skipped: string[] }> {
  const generator = getGenerator(shortfall.taskType)!;
  const skipped: string[] = [];

  let stimulusId: string | null = null;
  if (generator.needsStimulus && stimulus?.text) {
    const { data: stimRow, error } = await db
      .from("toefl_stimulus")
      .insert({
        module_id: shortfall.moduleId,
        task_type: shortfall.taskType,
        title: stimulus.title || null,
        // 듣기 스크립트는 transcript 로도 남긴다 — 오디오를 나중에 만들 때 원문이 필요하다.
        body: generator.stimulusAudio ? null : stimulus.text,
        transcript: generator.stimulusAudio ? stimulus.text : null,
        position: 1,
      })
      .select("id")
      .single();
    if (error || !stimRow) return { saved: 0, skipped: [`지문 저장 실패: ${error?.message}`] };
    stimulusId = stimRow.id as string;
  }

  const { data: maxItem } = await db
    .from("toefl_item")
    .select("position")
    .eq("module_id", shortfall.moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let position = (maxItem?.position ?? 0) + 1;

  let saved = 0;
  for (const draft of drafts) {
    const row = generator.toItemRow({ ...draft, skill_tags: draft.skill_tags ?? [] });
    if (!row.ok) {
      skipped.push(row.message);
      continue;
    }
    const { error } = await db.from("toefl_item").insert({
      module_id: shortfall.moduleId,
      stimulus_id: stimulusId,
      task_type: shortfall.taskType,
      position: position++,
      difficulty,
      scoring_mode: generator.scoringMode,
      prompt: row.prompt,
      payload: row.payload,
      answer_key: row.answerKey,
      explanation_ko: draft.explanation_ko,
      skill_tags: draft.skill_tags ?? [],
      // 오디오가 필요한 유형(choose_a_response)의 "실제로 들려줄 문장"을 여기서 보존한다 —
      // 이 대량생성 경로는 저장 직후 TTS를 안 하고 오디오를 나중 단계로 미루는데, 예전엔
      // 이 값을 아무 데도 안 남겨서 나중에 오디오를 영원히 못 만드는 문항이 쌓였다
      // (2026-08-31 실측 69개, 그중 다수가 검수까지 통과해 오디오 없이 노출 중이었음).
      // payload에는 못 넣는다(듣기 전에 대본을 읽어버리는 셈 — spec §5).
      spoken_text_private: row.spokenText,
      // 검수 전이라 학생에게 안 보인다. 관리 화면에서 승인해야 노출된다.
      verified: false,
      source: "ai",
      ...(options.batchId ? { batch_id: options.batchId } : {}),
    });
    if (error) skipped.push(`저장 실패: ${error.message}`);
    else saved += 1;
  }
  return { saved, skipped };
}
