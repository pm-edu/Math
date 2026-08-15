import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { generateSpeechWav } from "@/lib/toefl/server/tts";

// TOEFL 데모 Listening 콘텐츠(TOEFL_DEMO_001)에 실제 음성 파일을 채워 넣는 1회성 관리자 도구.
// P0에서 심은 데모 데이터는 대본(transcript)만 있고 오디오가 없었다(P1은 Reading이라 필요 없었음).
// - conversation/announcement/academic_talk: toefl_stimulus.transcript를 그대로 읽어서 저장.
// - choose_a_response: payload에 "말하는 문장" 필드가 원래 없어서(spec §6 계약에 없음), 정답이
//   자연스럽게 이어지도록 이 파일에 직접 문장을 하나씩 지어 붙였다(DB에는 저장하지 않음 — payload는
//   toefl_item_public을 통해 학생에게 그대로 노출되므로, 대사를 payload에 넣으면 "듣기 전에 대본을
//   글로 읽는" 셈이 되어 §5 보안 요구사항을 깬다. 그래서 clip_path만 채우고 대사 텍스트는 여기 상수로만 존재).
// 여러 번 실행해도 안전(이미 audio_path/clip_path가 있으면 건너뜀, ?force=1이면 다시 생성).
// staff-authenticated 클라이언트로 충분하다 — RLS가 toefl_module/toefl_item/toefl_stimulus와
// toefl-audio 버킷 둘 다 is_staff()에게 전체 권한을 이미 허용한다(service role 불필요).

const CHOOSE_A_RESPONSE_UTTERANCES: { matchExplanation: string; utterance: string }[] = [
  { matchExplanation: "셔틀 운행 여부", utterance: "Does the shuttle run in the evening?" },
  { matchExplanation: "수락하는 응답", utterance: "Can we meet at the library at noon?" },
  { matchExplanation: "우선순위", utterance: "Which part of the report should we revise first?" },
];

type LogEntry = { kind: "stimulus" | "item"; id: string; status: "generated" | "skipped" | "error"; message: string };

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { client } = auth;

  const force = new URL(req.url).searchParams.get("force") === "1";
  const log: LogEntry[] = [];

  const { data: form } = await client
    .from("toefl_form")
    .select("id")
    .eq("code", "TOEFL_DEMO_001")
    .maybeSingle();
  if (!form) return jsonError(404, "TOEFL_DEMO_001 폼을 찾을 수 없습니다.");

  const { data: modules } = await client
    .from("toefl_module")
    .select("id")
    .eq("form_id", form.id)
    .eq("section", "listening");
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return jsonError(404, "Listening 모듈을 찾을 수 없습니다.");

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
    .select("id, payload, explanation_ko")
    .in("module_id", moduleIds)
    .eq("task_type", "choose_a_response");

  for (const item of items ?? []) {
    const payload = (item.payload ?? {}) as { clip_path?: string | null };
    if (payload.clip_path && !force) {
      log.push({ kind: "item", id: item.id, status: "skipped", message: "이미 오디오 있음" });
      continue;
    }
    const entry = CHOOSE_A_RESPONSE_UTTERANCES.find((u) => (item.explanation_ko ?? "").includes(u.matchExplanation));
    if (!entry) {
      log.push({ kind: "item", id: item.id, status: "error", message: "이 문항에 맞는 대사를 찾지 못했습니다." });
      continue;
    }
    const path = `demo/item-${item.id}.wav`;
    const result = await generateAndUpload(client, entry.utterance, path);
    if (!result.ok) {
      log.push({ kind: "item", id: item.id, status: "error", message: result.message });
      continue;
    }
    const { error: updateErr } = await client
      .from("toefl_item")
      .update({ payload: { ...payload, clip_path: path } })
      .eq("id", item.id);
    log.push(
      updateErr
        ? { kind: "item", id: item.id, status: "error", message: `DB 저장 실패: ${updateErr.message}` }
        : { kind: "item", id: item.id, status: "generated", message: `${path} (${result.durationSec.toFixed(1)}s)` }
    );
  }

  return Response.json({ ok: true, log });
}

async function generateAndUpload(
  client: SupabaseClient,
  text: string,
  path: string
): Promise<{ ok: true; durationSec: number } | { ok: false; message: string }> {
  const tts = await generateSpeechWav(text);
  if (!tts.ok) return { ok: false, message: tts.message };

  const { error } = await client.storage
    .from("toefl-audio")
    .upload(path, tts.wav, { contentType: "audio/wav", upsert: true });
  if (error) return { ok: false, message: `업로드 실패: ${error.message}` };

  return { ok: true, durationSec: tts.durationSec };
}
