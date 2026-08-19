import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { resolveCurrentModule, resolveModuleItemIds } from "@/lib/toefl/server/modules";

// 현재 모듈 문항 + 잔여시간 + 기존 답안. docs/toefl-spec.md §9, §11.
// 새로고침 복구는 전적으로 이 엔드포인트에 의존한다(로컬스토리지에 의존하지 않음, §11 3번 규칙) —
// 시험 시작 직후 첫 화면도 이 엔드포인트를 그대로 호출해서 그린다(두 갈래 로직을 만들지 않기 위해).
// answer_key/explanation_*/transcript는 이 응답에 절대 담지 않는다(§5).

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status, mode, toefl_form(blueprint_version)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  const blueprintVersion = (attempt.toefl_form as unknown as { blueprint_version: string } | null)?.blueprint_version ?? "";

  // section_practice 모드는 attempt당 section_attempt가 정확히 1개라 attempt_id만으로 찾는다.
  // (URL에 section이 없는 이유: 어느 영역이든 이 엔드포인트 하나로 "현재 상태"를 알려주기 위함)
  const { data: sectionAttempt } = await client
    .from("toefl_section_attempt")
    .select("id, section, deadline_at, finished_at, routed_to, raw_score, scaled_score, band")
    .eq("attempt_id", attemptId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sectionAttempt) return jsonError(404, "응시 기록을 찾을 수 없습니다.");
  const section = sectionAttempt.section;

  if (sectionAttempt.finished_at) {
    return Response.json({
      ok: true,
      attempt: { id: attempt.id, status: attempt.status, mode: attempt.mode },
      section: {
        section,
        finished: true,
        deadline_at: null,
        raw_score: sectionAttempt.raw_score,
        scaled_score: sectionAttempt.scaled_score,
        band: sectionAttempt.band,
      },
      module: null,
      items: [],
      stimuli: [],
      answers: {},
    });
  }

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, attempt.form_id, section, sectionAttempt.routed_to);
  if (!module) return jsonError(500, "현재 모듈을 찾을 수 없습니다.");

  // 모듈에 등록된 문항이 블루프린트 목표치보다 많을 수 있다(관리자가 계속 등록하므로, P6) —
  // 매번 전부 보여주지 않고 목표 개수만큼 무작위로 뽑되, 이 attempt 안에서는 항상 같은 조합을 쓴다.
  const selectedItemIds = await resolveModuleItemIds(
    service,
    attemptId,
    module.id,
    section,
    module.stage,
    module.route,
    blueprintVersion
  );

  const [{ data: items }, { data: stimuli }] = await Promise.all([
    selectedItemIds.length
      ? client.from("toefl_item_public").select("*").in("id", selectedItemIds).order("position")
      : Promise.resolve({ data: [] as never[] }),
    client.from("toefl_stimulus_public").select("*").eq("module_id", module.id).order("position"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: responses } = itemIds.length
    ? await client
        .from("toefl_response")
        .select("item_id, answer, audio_path, time_spent_ms")
        .eq("attempt_id", attemptId)
        .in("item_id", itemIds)
    : { data: [] as { item_id: string; answer: unknown; audio_path: string | null; time_spent_ms: number | null }[] };

  const answers: Record<string, { answer: unknown; time_spent_ms: number | null }> = {};
  for (const r of responses ?? []) {
    // Speaking(listen_and_repeat/take_an_interview)은 답을 answer(jsonb)가 아니라 전용 audio_path
    // 컬럼에 저장한다 — 여기서 answer가 비어 있으면 audio_path로 채워야 새로고침 후에도
    // "녹음됨" 표시가 유지된다(전엔 audio_path를 아예 안 읽어와서 새로고침하면 표시가 사라졌음).
    answers[r.item_id] = { answer: r.answer ?? (r.audio_path ? { audio_path: r.audio_path } : null), time_spent_ms: r.time_spent_ms };
  }

  // toefl-audio 버킷은 비공개(signed URL 전용, spec §5)라 학생 세션으로는 직접 못 읽는다.
  // audio_path/payload.clip_path에 담긴 "Storage key"를 여기서 잠깐 유효한 signed URL로
  // 바꿔치기해서 내려준다 — 원본 경로 문자열 자체는 응답에 남기지 않는다.
  const AUDIO_URL_TTL_SEC = 3600;
  const stimuliSigned = await Promise.all(
    (stimuli ?? []).map(async (s) => {
      if (!s.audio_path) return s;
      const { data: signed } = await service.storage
        .from("toefl-audio")
        .createSignedUrl(s.audio_path, AUDIO_URL_TTL_SEC);
      return signed?.signedUrl ? { ...s, audio_path: signed.signedUrl } : s;
    })
  );
  const itemsSigned = await Promise.all(
    (items ?? []).map(async (it) => {
      const payload = it.payload as {
        clip_path?: string | null;
        question_audio_path?: string | null;
        target_sentence?: string;
        question_text?: string;
      } | null;
      let nextPayload = payload;
      // "들어야 알 수 있는 것"을 글자로 내려보내면 시험이 성립하지 않는다(§5·§10).
      // toefl_item_public 뷰는 answer_key/explanation만 걸러내고 payload 내부까지는 못 걸러내므로
      // 여기서 직접 제거한다. finish 채점과 TTS는 service role로 원본 payload를 다시 읽으므로 영향 없다.
      //   listen_and_repeat.target_sentence  따라 말할 문장 = 정답 그 자체
      //   take_an_interview.question_text    질문은 음성으로만 전달한다(텍스트 표시 금지)
      // payload에 새 필드를 넣을 때 이 목록도 함께 갱신할 것.
      const SECRET_PAYLOAD_FIELDS: Record<string, string[]> = {
        listen_and_repeat: ["target_sentence"],
        take_an_interview: ["question_text"],
      };
      for (const field of SECRET_PAYLOAD_FIELDS[it.task_type] ?? []) {
        if (nextPayload && field in nextPayload) {
          const rest = { ...nextPayload } as Record<string, unknown>;
          delete rest[field];
          nextPayload = rest as typeof nextPayload;
        }
      }
      if (payload?.clip_path) {
        const { data: signed } = await service.storage
          .from("toefl-audio")
          .createSignedUrl(payload.clip_path, AUDIO_URL_TTL_SEC);
        if (signed?.signedUrl) nextPayload = { ...nextPayload, clip_path: signed.signedUrl };
      }
      // take_an_interview 질문 음성(§10: 질문을 텍스트로 보여주지 않으므로 이 오디오가 유일한 전달 수단)
      if (payload?.question_audio_path) {
        const { data: signed } = await service.storage
          .from("toefl-audio")
          .createSignedUrl(payload.question_audio_path, AUDIO_URL_TTL_SEC);
        if (signed?.signedUrl) nextPayload = { ...nextPayload, question_audio_path: signed.signedUrl };
      }
      return nextPayload === payload ? it : { ...it, payload: nextPayload };
    })
  );

  return Response.json({
    ok: true,
    attempt: { id: attempt.id, status: attempt.status, mode: attempt.mode },
    section: {
      section,
      finished: false,
      deadline_at: sectionAttempt.deadline_at,
    },
    // route(easy/hard)는 절대 클라이언트에 노출하지 않는다(§8). stage(1/2)는 몇 단계인지만
    // 알려주는 정보라 난이도를 드러내지 않으므로 노출해도 무방하다 — "Part 1/2" 표시용.
    module: { id: module.id, position: module.position, stage: module.stage },
    items: itemsSigned,
    stimuli: stimuliSigned,
    answers,
  });
}
