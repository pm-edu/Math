import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSpeechWav } from "./tts";

// TOEFL 데모 Listening/Speaking 콘텐츠(TOEFL_DEMO_001)에 실제 음성 파일을 채워 넣는 1회성 도구.
// 화면 검토(2026-08-27) [D]: 원래 /admin/toefl/audio 관리자 화면+API 라우트였던 것을 CLI로
// 옮겼다 — 문항 대량 생성(scripts/toefl-generate.ts)과 같은 이유: 1회성 시드 도구를 굳이
// 관리자 메뉴에 상시 노출할 필요가 없고, 실행 결과(로그)는 터미널로 보는 게 더 간단하다.
// 로직 자체는 그대로 옮겨온 것(동작 변화 없음) — service role 클라이언트를 넘겨 호출한다.
//
// - conversation/announcement/academic_talk: toefl_stimulus.transcript를 그대로 읽어서 저장.
// - choose_a_response: payload에 "말하는 문장" 필드가 원래 없어서(spec §6 계약에 없음), 정답이
//   자연스럽게 이어지도록 이 파일에 직접 문장을 하나씩 지어 붙였다(DB에는 저장하지 않음 — payload는
//   toefl_item_public을 통해 학생에게 그대로 노출되므로, 대사를 payload에 넣으면 "듣기 전에 대본을
//   글로 읽는" 셈이 되어 §5 보안 요구사항을 깬다. 그래서 clip_path만 채우고 대사 텍스트는 여기 상수로만 존재).
// 여러 번 실행해도 안전(이미 audio_path/clip_path가 있으면 건너뜀, force:true면 다시 생성).

const CHOOSE_A_RESPONSE_UTTERANCES: { matchExplanation: string; utterance: string }[] = [
  { matchExplanation: "셔틀 운행 여부", utterance: "Does the shuttle run in the evening?" },
  { matchExplanation: "수락하는 응답", utterance: "Can we meet at the library at noon?" },
  { matchExplanation: "우선순위", utterance: "Which part of the report should we revise first?" },
];

export type DemoAudioLogEntry = { kind: "stimulus" | "item"; id: string; status: "generated" | "skipped" | "error"; message: string };

export async function generateDemoAudio(client: SupabaseClient, options: { force?: boolean } = {}): Promise<DemoAudioLogEntry[]> {
  const force = options.force ?? false;
  const log: DemoAudioLogEntry[] = [];

  const { data: form } = await client.from("toefl_form").select("id").eq("code", "TOEFL_DEMO_001").maybeSingle();
  if (!form) {
    log.push({ kind: "stimulus", id: "-", status: "error", message: "TOEFL_DEMO_001 폼을 찾을 수 없습니다." });
    return log;
  }

  const { data: modules } = await client.from("toefl_module").select("id").eq("form_id", form.id).eq("section", "listening");
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) {
    log.push({ kind: "stimulus", id: "-", status: "error", message: "Listening 모듈을 찾을 수 없습니다." });
    return log;
  }

  const { data: stimuli } = await client
    .from("toefl_stimulus")
    .select("id, transcript, audio_path")
    .in("module_id", moduleIds)
    .not("transcript", "is", null);

  for (const s of stimuli ?? []) {
    if (s.audio_path && !force) {
      log.push({ kind: "stimulus", id: s.id, status: "skipped", message: "이미 오디오 있음" });
      continue;
    }
    const path = `demo/stimulus-${s.id}.wav`;
    const result = await generateAndUpload(client, s.transcript as string, path);
    if (!result.ok) {
      log.push({ kind: "stimulus", id: s.id, status: "error", message: result.message });
      continue;
    }
    const { error: updateErr } = await client
      .from("toefl_stimulus")
      .update({ audio_path: path, audio_duration_sec: Math.round(result.durationSec) })
      .eq("id", s.id);
    log.push(
      updateErr
        ? { kind: "stimulus", id: s.id, status: "error", message: `DB 저장 실패: ${updateErr.message}` }
        : { kind: "stimulus", id: s.id, status: "generated", message: `${path} (${result.durationSec.toFixed(1)}s)` }
    );
  }

  const { data: items } = await client
    .from("toefl_item")
    .select("id, payload, explanation_ko, spoken_text_private")
    .in("module_id", moduleIds)
    .eq("task_type", "choose_a_response");

  for (const item of items ?? []) {
    const payload = (item.payload ?? {}) as { clip_path?: string | null };
    if (payload.clip_path && !force) {
      log.push({ kind: "item", id: item.id, status: "skipped", message: "이미 오디오 있음" });
      continue;
    }
    // 2026-08-31부터 저장 시점에 spoken_text_private을 보존한다 — 그게 있으면 그걸 쓰고,
    // 없는 옛 데모 3개짜리만 예전 방식(설명 텍스트 매칭)으로 대사를 찾는다.
    const utterance = item.spoken_text_private ?? CHOOSE_A_RESPONSE_UTTERANCES.find((u) => (item.explanation_ko ?? "").includes(u.matchExplanation))?.utterance;
    if (!utterance) {
      log.push({ kind: "item", id: item.id, status: "error", message: "이 문항에 맞는 대사를 찾지 못했습니다(spoken_text_private 없음, 복구 스크립트 필요)." });
      continue;
    }
    const path = `demo/item-${item.id}.wav`;
    const result = await generateAndUpload(client, utterance, path);
    if (!result.ok) {
      log.push({ kind: "item", id: item.id, status: "error", message: result.message });
      continue;
    }
    // is_active: true — 오디오가 없어서 비활성화해둔 문항(2026-08-31)이 이제 오디오가
    // 생겼으니 다시 켠다. 이 유형을 비활성화하는 다른 이유는 없어서 무조건 켜도 안전하다.
    const { error: updateErr } = await client
      .from("toefl_item")
      .update({ payload: { ...payload, clip_path: path }, is_active: true })
      .eq("id", item.id);
    log.push(
      updateErr
        ? { kind: "item", id: item.id, status: "error", message: `DB 저장 실패: ${updateErr.message}` }
        : { kind: "item", id: item.id, status: "generated", message: `${path} (${result.durationSec.toFixed(1)}s)` }
    );
  }

  // ── Speaking: listen_and_repeat(target_sentence) + take_an_interview(질문) ──
  const { data: speakingModules } = await client.from("toefl_module").select("id").eq("form_id", form.id).eq("section", "speaking");
  const speakingModuleIds = (speakingModules ?? []).map((m) => m.id);

  if (speakingModuleIds.length > 0) {
    const { data: speakingItems } = await client
      .from("toefl_item")
      .select("id, task_type, prompt, payload")
      .in("module_id", speakingModuleIds)
      .in("task_type", ["listen_and_repeat", "take_an_interview"]);

    for (const item of speakingItems ?? []) {
      if (item.task_type === "listen_and_repeat") {
        const payload = (item.payload ?? {}) as { clip_path?: string | null; target_sentence?: string };
        if (payload.clip_path && !force) {
          log.push({ kind: "item", id: item.id, status: "skipped", message: "이미 오디오 있음" });
          continue;
        }
        if (!payload.target_sentence) {
          log.push({ kind: "item", id: item.id, status: "error", message: "target_sentence가 없습니다." });
          continue;
        }
        const path = `demo/item-${item.id}.wav`;
        const result = await generateAndUpload(client, payload.target_sentence, path);
        if (!result.ok) {
          log.push({ kind: "item", id: item.id, status: "error", message: result.message });
          continue;
        }
        const { error: updateErr } = await client.from("toefl_item").update({ payload: { ...payload, clip_path: path } }).eq("id", item.id);
        log.push(
          updateErr
            ? { kind: "item", id: item.id, status: "error", message: `DB 저장 실패: ${updateErr.message}` }
            : { kind: "item", id: item.id, status: "generated", message: `${path} (${result.durationSec.toFixed(1)}s)` }
        );
      } else {
        const payload = (item.payload ?? {}) as { question_audio_path?: string | null };
        if (payload.question_audio_path && !force) {
          log.push({ kind: "item", id: item.id, status: "skipped", message: "이미 오디오 있음" });
          continue;
        }
        const path = `demo/item-${item.id}.wav`;
        const result = await generateAndUpload(client, item.prompt, path);
        if (!result.ok) {
          log.push({ kind: "item", id: item.id, status: "error", message: result.message });
          continue;
        }
        const { error: updateErr } = await client
          .from("toefl_item")
          .update({ payload: { ...payload, question_audio_path: path } })
          .eq("id", item.id);
        log.push(
          updateErr
            ? { kind: "item", id: item.id, status: "error", message: `DB 저장 실패: ${updateErr.message}` }
            : { kind: "item", id: item.id, status: "generated", message: `${path} (${result.durationSec.toFixed(1)}s)` }
        );
      }
    }
  }

  return log;
}

async function generateAndUpload(
  client: SupabaseClient,
  text: string,
  path: string
): Promise<{ ok: true; durationSec: number } | { ok: false; message: string }> {
  const tts = await generateSpeechWav(text);
  if (!tts.ok) return { ok: false, message: tts.message };

  const { error } = await client.storage.from("toefl-audio").upload(path, tts.wav, { contentType: "audio/wav", upsert: true });
  if (error) return { ok: false, message: `업로드 실패: ${error.message}` };

  return { ok: true, durationSec: tts.durationSec };
}
