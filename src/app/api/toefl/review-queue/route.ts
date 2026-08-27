import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { TASK_TYPE_SECTION } from "@/lib/toefl/section-order";
import type { ToeflSection, ToeflTaskType } from "@/lib/toefl/types";
import type { ReviewItem } from "@/components/toefl/review/types";

// TOEFL 전용 복습 플레이어(2026-08-27 3차 화면 검토 [B], "TOEFL 전용 복습 플레이어 신설" 선택)의
// 데이터 소스. attempts/[id]/review와 같은 모양(ReviewItem)으로 응답해서, 화면이 같은
// ReviewItemCard 컴포넌트를 그대로 재사용할 수 있게 한다 — 12개 문항 유형별 렌더링을
// 새로 만들지 않는다(reuse, spec §13 정신 그대로 채점 UI에도 적용).
//
// 스코프(1차 버전, 의도적으로 좁힘):
// - 최근 오답 문항만 모은다(is_correct=false). ai_rubric(에세이·인터뷰) 응답은 is_correct 자체가
//   never set이라(scoreItem이 자동채점 유형에만 채움) 자연히 빠진다 — "맞았다/틀렸다"가 명확한
//   객관식·자동채점 유형만 복습 대상이 되는 게 이 기능의 성격과 맞는다. 단 listen_and_repeat는
//   auto_transcript라 is_correct가 채워지므로(단어정확도 기준) 여기 포함될 수 있고, 그 유형은
//   녹음 응답이 있으므로 audio_path도 서명해서 내려준다(아래).
// - 스케줄링(간격반복) 없음 — "최근 오답 최신순"만 있는 단순 목록이다. 진짜 spaced repetition은
//   범위가 훨씬 커서(다시 맞히면 언제 재출제할지 등) 이번 1차 버전 스코프 밖으로 명시적으로 뺐다.
// - 같은 문항을 여러 번 틀렸으면 가장 최근 것 하나만 보여준다(중복 방지).

const REVIEW_QUEUE_SIZE = 20;
const AUDIO_URL_TTL_SEC = 3600;

export async function GET(req: Request) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { client, userId } = auth;

  // RLS "own responses"는 staff에게 전체 조회를 허용하므로(관리자 큐 화면용), 이 개인화된
  // 엔드포인트에서는 본인 attempt로 직접 좁혀야 한다 — 안 그러면 관리자 계정이 호출했을 때
  // 다른 학생의 오답까지 섞여 나온다.
  const { data: myAttempts } = await client.from("toefl_attempt").select("id").eq("user_id", userId);
  const attemptIds = (myAttempts ?? []).map((a) => a.id);
  if (attemptIds.length === 0) return Response.json({ ok: true, items: [] as ReviewItem[] });

  const { data: wrongResponses } = await client
    .from("toefl_response")
    .select("id, item_id, answer, audio_path, transcript, is_correct, points_earned, answered_at")
    .eq("is_correct", false)
    .in("attempt_id", attemptIds)
    .order("answered_at", { ascending: false })
    .limit(200); // 넉넉히 가져와서 중복 제거 후 REVIEW_QUEUE_SIZE로 자른다

  const seenItemIds = new Set<string>();
  const dedupedResponses = (wrongResponses ?? []).filter((r) => {
    if (seenItemIds.has(r.item_id)) return false;
    seenItemIds.add(r.item_id);
    return true;
  });
  const responses = dedupedResponses.slice(0, REVIEW_QUEUE_SIZE);
  if (responses.length === 0) return Response.json({ ok: true, items: [] as ReviewItem[] });

  const service = createToeflServiceClient();
  const itemIds = responses.map((r) => r.item_id);

  const { data: items } = await service
    .from("toefl_item")
    .select("id, stimulus_id, task_type, position, points, scoring_mode, prompt, payload, answer_key, explanation_ko, vocab_ids")
    .in("id", itemIds);

  const stimulusIds = Array.from(new Set((items ?? []).map((i) => i.stimulus_id).filter((x): x is string => !!x)));
  const { data: stimuli } = stimulusIds.length
    ? await service
        .from("toefl_stimulus")
        .select("id, module_id, task_type, title, body, audio_path, transcript, audio_duration_sec, image_path, position")
        .in("id", stimulusIds)
    : { data: [] as never[] };
  const stimulusById = new Map((stimuli ?? []).map((s) => [s.id, s]));

  async function sign(bucket: "toefl-audio" | "toefl-recordings", path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const { data } = await service.storage.from(bucket).createSignedUrl(path, AUDIO_URL_TTL_SEC);
    return data?.signedUrl ?? null;
  }

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const stimulusSignedCache = new Map<string, string | null>();

  const reviewItems = await Promise.all(
    responses.map(async (r) => {
      const item = itemById.get(r.item_id);
      if (!item) return null;

      const stimulusRow = item.stimulus_id ? (stimulusById.get(item.stimulus_id) ?? null) : null;
      let stimulus = null;
      if (stimulusRow) {
        if (!stimulusSignedCache.has(stimulusRow.id)) {
          stimulusSignedCache.set(stimulusRow.id, await sign("toefl-audio", stimulusRow.audio_path));
        }
        stimulus = { ...stimulusRow, audio_path: stimulusSignedCache.get(stimulusRow.id) ?? null };
      }

      const payload = item.payload as Record<string, unknown>;
      let signedPayload = payload;
      if (typeof payload.clip_path === "string") {
        signedPayload = { ...signedPayload, clip_path: await sign("toefl-audio", payload.clip_path) };
      }
      if (typeof payload.question_audio_path === "string") {
        signedPayload = { ...signedPayload, question_audio_path: await sign("toefl-audio", payload.question_audio_path) };
      }

      // listen_and_repeat만 녹음 응답이 있다(위 스코프 설명 참고) — 나머지 유형은 애초에
      // r.audio_path 자체가 null이라 sign()이 그대로 null을 돌려준다.
      const responseAudioSigned = await sign("toefl-recordings", r.audio_path);

      const reviewItem: ReviewItem = {
        id: item.id,
        section: TASK_TYPE_SECTION[item.task_type as ToeflTaskType] as ToeflSection,
        task_type: item.task_type,
        position: item.position,
        points: item.points,
        scoring_mode: item.scoring_mode,
        prompt: item.prompt,
        payload: signedPayload,
        answer_key: item.answer_key,
        explanation_ko: item.explanation_ko,
        vocab_ids: item.vocab_ids ?? [],
        stimulus,
        response: {
          answer: r.answer,
          audio_path: responseAudioSigned,
          transcript: r.transcript,
          is_correct: r.is_correct,
          points_earned: r.points_earned,
        },
        ai_score: null,
        review_status: "graded",
      };
      return reviewItem;
    })
  );

  return Response.json({ ok: true, items: reviewItems.filter((x): x is ReviewItem => x !== null) });
}
