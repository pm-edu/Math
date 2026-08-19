import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { resolveCurrentModule } from "@/lib/toefl/server/modules";
import { ADAPTIVE_SECTIONS, SECTION_ORDER } from "@/lib/toefl/section-order";
import type { ToeflRoute, ToeflSection } from "@/lib/toefl/types";

// 문항별 리뷰 화면 전용 라우트. docs/toefl-spec.md §14: "오디오 스크립트는 제출 후 제공" —
// 이 라우트가 바로 그 "제출 후"의 유일한 통로다. toefl_item/toefl_stimulus는 staff-only RLS라
// (answer_key/explanation_*/transcript 포함) service role로만 읽을 수 있고, 평소엔
// service-client.ts 주석대로 "이 값을 API 응답에 절대 담지 않는다"가 원칙이지만, 이 라우트는
// 응시가 이미 끝난(다시 badge 못 바꾸는) 뒤에만 호출 가능해서 예외로 둔다 — 아래 상태 체크가
// 그 유일한 게이트.

const AUDIO_URL_TTL_SEC = 3600;

type ReviewStatus = "graded" | "pending_manual" | "unanswered";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status, mode")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  if (attempt.status === "in_progress") return jsonError(403, "제출 후에만 리뷰를 볼 수 있습니다.");

  const { data: sectionAttempts } = await client
    .from("toefl_section_attempt")
    .select("section, routed_to, finished_at, raw_score, scaled_score, band")
    .eq("attempt_id", attemptId);
  const finishedSections = (sectionAttempts ?? [])
    .filter((s) => s.finished_at)
    .sort((a, b) => SECTION_ORDER.indexOf(a.section as ToeflSection) - SECTION_ORDER.indexOf(b.section as ToeflSection));

  if (finishedSections.length === 0) {
    return Response.json({ ok: true, attempt: { mode: attempt.mode, status: attempt.status }, sections: [], items: [] });
  }

  const service = createToeflServiceClient();

  // 섹션별로 실제 응시한 모듈(적응형이면 stage1+stage2, 아니면 1개)을 순서대로 모은다 —
  // items 배열이 화면 순서(섹션 → stage1/stage2 → position)와 자연히 맞도록.
  const moduleGroups = await Promise.all(
    finishedSections.map(async (sa) => {
      const section = sa.section as ToeflSection;
      const routedTo = sa.routed_to as ToeflRoute | null;
      const stage1 = await resolveCurrentModule(service, attempt.form_id, section, null);
      const stage2 =
        ADAPTIVE_SECTIONS.includes(section) && routedTo
          ? await resolveCurrentModule(service, attempt.form_id, section, routedTo)
          : null;
      return { section, moduleIds: [stage1, stage2].filter((m): m is NonNullable<typeof m> => !!m).map((m) => m.id) };
    })
  );

  const allModuleIds = moduleGroups.flatMap((g) => g.moduleIds);
  const moduleToSection = new Map(moduleGroups.flatMap((g) => g.moduleIds.map((id) => [id, g.section] as const)));

  // 모듈에 등록된 문항이 이 attempt가 실제로 뽑은 것보다 많을 수 있다(P6, 관리자가 계속
  // 등록하므로) — current(GET)가 응시 중 저장해둔 조합(toefl_attempt_item_selection)을 그대로
  // 써서 "실제로 본 문항"만 리뷰에 보여준다. 저장된 조합이 없는 모듈이 하나라도 있으면(예전
  // 데이터 등) 안전하게 예전 방식(모듈 전체)으로 되돌아간다.
  const { data: selectionRows } = allModuleIds.length
    ? await service.from("toefl_attempt_item_selection").select("module_id, item_ids").eq("attempt_id", attemptId).in("module_id", allModuleIds)
    : { data: [] as { module_id: string; item_ids: string[] }[] };
  const selectedIdsByModule = new Map((selectionRows ?? []).map((r) => [r.module_id, r.item_ids as string[]]));
  const hasFullSelectionCoverage = allModuleIds.length > 0 && allModuleIds.every((mid) => selectedIdsByModule.has(mid));
  const reviewItemIds = hasFullSelectionCoverage ? allModuleIds.flatMap((mid) => selectedIdsByModule.get(mid) ?? []) : null;

  const itemColumns =
    "id, module_id, stimulus_id, task_type, position, points, scoring_mode, prompt, payload, answer_key, explanation_ko, skill_tags, vocab_ids";
  const [{ data: items }, { data: stimuli }] = await Promise.all([
    reviewItemIds
      ? reviewItemIds.length
        ? service.from("toefl_item").select(itemColumns).in("id", reviewItemIds)
        : Promise.resolve({ data: [] })
      : allModuleIds.length
        ? service.from("toefl_item").select(itemColumns).in("module_id", allModuleIds)
        : Promise.resolve({ data: [] }),
    allModuleIds.length
      ? service
          .from("toefl_stimulus")
          .select("id, module_id, task_type, title, body, audio_path, transcript, audio_duration_sec, image_path, position")
          .in("module_id", allModuleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: responses } = itemIds.length
    ? await client
        .from("toefl_response")
        .select("id, item_id, answer, audio_path, transcript, is_correct, points_earned, answered_at")
        .eq("attempt_id", attemptId)
        .in("item_id", itemIds)
    : {
        data: [] as {
          id: string;
          item_id: string;
          answer: unknown;
          audio_path: string | null;
          transcript: string | null;
          is_correct: boolean | null;
          points_earned: number | null;
          answered_at: string;
        }[],
      };

  const responseByItem = new Map((responses ?? []).map((r) => [r.item_id, r]));
  const responseIds = (responses ?? []).map((r) => r.id);
  const { data: aiScoreRows } = responseIds.length
    ? await client.from("toefl_ai_score").select("response_id, rubric, overall, feedback_ko").in("response_id", responseIds)
    : { data: [] as { response_id: string; rubric: Record<string, number>; overall: number; feedback_ko: string }[] };
  const aiScoreByResponse = new Map((aiScoreRows ?? []).map((s) => [s.response_id, s]));

  async function sign(bucket: "toefl-audio" | "toefl-recordings", path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const { data } = await service.storage.from(bucket).createSignedUrl(path, AUDIO_URL_TTL_SEC);
    return data?.signedUrl ?? null;
  }

  const stimulusById = new Map((stimuli ?? []).map((s) => [s.id, s]));
  const stimulusSignedCache = new Map<string, string | null>();

  const reviewItems = await Promise.all(
    (items ?? [])
      .sort((a, b) => {
        const sa = moduleToSection.get(a.module_id) ?? "";
        const sb = moduleToSection.get(b.module_id) ?? "";
        if (sa !== sb) return SECTION_ORDER.indexOf(sa as ToeflSection) - SECTION_ORDER.indexOf(sb as ToeflSection);
        if (a.module_id !== b.module_id) return a.module_id.localeCompare(b.module_id);
        return a.position - b.position;
      })
      .map(async (item) => {
        const response = responseByItem.get(item.id) ?? null;
        const aiScore = response ? (aiScoreByResponse.get(response.id) ?? null) : null;

        let status: ReviewStatus = "unanswered";
        if (response) {
          status = item.scoring_mode === "ai_rubric" ? (aiScore ? "graded" : "pending_manual") : "graded";
        }

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

        const responseAudioSigned = response?.audio_path ? await sign("toefl-recordings", response.audio_path) : null;

        return {
          id: item.id,
          section: moduleToSection.get(item.module_id) as ToeflSection,
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
          response: response
            ? {
                answer: response.answer,
                audio_path: responseAudioSigned,
                transcript: response.transcript,
                is_correct: response.is_correct,
                points_earned: response.points_earned,
              }
            : null,
          ai_score: aiScore,
          review_status: status,
        };
      })
  );

  return Response.json({
    ok: true,
    attempt: { mode: attempt.mode, status: attempt.status },
    sections: finishedSections.map((s) => ({
      section: s.section,
      raw_score: s.raw_score,
      scaled_score: s.scaled_score,
      band: s.band,
    })),
    items: reviewItems,
  });
}
