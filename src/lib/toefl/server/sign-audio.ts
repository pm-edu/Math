import type { SupabaseClient } from "@supabase/supabase-js";

// toefl-audio 버킷은 비공개(signed URL 전용, spec §5)라 학생 세션으로는 직접 못 읽는다.
// 원래 attempts/[id]/current/route.ts 안에 있던 로직을 그대로 뽑아왔다(2026-08-28,
// /api/toefl/practice에서도 똑같이 필요해져서 — 두 곳에 복붙하지 않는다).

export const AUDIO_URL_TTL_SEC = 3600;

// "들어야 알 수 있는 것"을 글자로 내려보내면 시험이 성립하지 않는다(§5·§10). payload에 새 필드를
// 넣을 때 이 목록도 함께 갱신할 것.
export const SECRET_PAYLOAD_FIELDS: Record<string, string[]> = {
  listen_and_repeat: ["target_sentence"],
  take_an_interview: ["question_text"],
};

export async function signStimulusAudio<T extends { audio_path: string | null }>(
  service: SupabaseClient,
  stimulus: T
): Promise<T> {
  if (!stimulus.audio_path) return stimulus;
  const { data: signed } = await service.storage.from("toefl-audio").createSignedUrl(stimulus.audio_path, AUDIO_URL_TTL_SEC);
  return signed?.signedUrl ? { ...stimulus, audio_path: signed.signedUrl } : stimulus;
}

export async function signItemPayloadAudio<T extends { task_type: string; payload: unknown }>(
  service: SupabaseClient,
  item: T
): Promise<T> {
  const payload = item.payload as Record<string, unknown> | null;
  let nextPayload = payload;

  for (const field of SECRET_PAYLOAD_FIELDS[item.task_type] ?? []) {
    if (nextPayload && field in nextPayload) {
      const rest = { ...nextPayload };
      delete rest[field];
      nextPayload = rest;
    }
  }

  const clipPath = payload?.clip_path as string | undefined;
  if (clipPath) {
    const { data: signed } = await service.storage.from("toefl-audio").createSignedUrl(clipPath, AUDIO_URL_TTL_SEC);
    if (signed?.signedUrl) nextPayload = { ...nextPayload, clip_path: signed.signedUrl };
  }

  // take_an_interview 질문 음성(§10: 질문을 텍스트로 보여주지 않으므로 이 오디오가 유일한 전달 수단)
  const questionAudioPath = payload?.question_audio_path as string | undefined;
  if (questionAudioPath) {
    const { data: signed } = await service.storage.from("toefl-audio").createSignedUrl(questionAudioPath, AUDIO_URL_TTL_SEC);
    if (signed?.signedUrl) nextPayload = { ...nextPayload, question_audio_path: signed.signedUrl };
  }

  return nextPayload === payload ? item : { ...item, payload: nextPayload };
}
