import { z } from "zod";
import { getOptionalToeflUserId } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { scorePracticeItem } from "@/lib/toefl/server/practice";

// 유형별 연습 채점 — 응시(attempts) 파이프라인과 완전히 분리된 경량 엔드포인트(practice.ts 상단
// 주석 참고). 로그인 사용자는 Authorization 헤더로, 게스트는 클라이언트가 만든 guestId(로컬 저장
// UUID)로 구분한다 — 게스트 인증 자체를 새로 만들지 않는다(2026-08-15 익명로그인 도입→롤백 결정,
// [[toefl-subsystem-plan]] 참고).
//
// listen_and_repeat/take_an_interview(오디오)는 Storage에 올리지 않고 녹음을 요청 본문에 그대로
// 실어 보내 Gemini에 바로 넣고 버린다 — 정식 응시의 toefl-recordings 버킷(RLS: 경로 첫 세그먼트=
// user_id)은 게스트가 못 쓰므로, 연습은 애초에 영구 저장을 안 해서 이 문제를 피해간다.

const AUDIO_TASK_TYPES = new Set(["listen_and_repeat", "take_an_interview"]);
const uuidSchema = z.string().uuid();
// 유형별 연습은 무제한이었는데, 유형당 하루 20문항으로 제한한다(2026-09-02 사용자 결정).
// 게스트도 guest_id로 똑같이 센다 — 로그인 사용자만 봐주면 게스트 쪽으로 우회하는 게 되므로.
const DAILY_PRACTICE_LIMIT_PER_TYPE = 20;

export async function POST(req: Request) {
  const service = createToeflServiceClient();
  const userId = await getOptionalToeflUserId(req);

  let itemId: string | undefined;
  let answer: unknown;
  let guestId: string | undefined;
  let audioBuffer: Buffer | undefined;
  let audioMime: string | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    itemId = form.get("itemId")?.toString();
    guestId = form.get("guestId")?.toString() || undefined;
    const audio = form.get("audio");
    if (audio instanceof File) {
      audioBuffer = Buffer.from(await audio.arrayBuffer());
      audioMime = audio.type || "audio/webm";
    }
  } else {
    const body = await req.json().catch(() => ({}));
    itemId = typeof body.itemId === "string" ? body.itemId : undefined;
    answer = body.answer;
    guestId = typeof body.guestId === "string" ? body.guestId : undefined;
  }

  const idParsed = uuidSchema.safeParse(itemId);
  if (!idParsed.success) return Response.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });

  if (!userId) {
    const guestParsed = uuidSchema.safeParse(guestId);
    if (!guestParsed.success) return Response.json({ ok: false, message: "guestId가 필요합니다." }, { status: 400 });
    guestId = guestParsed.data;
  }

  const { data: item } = await service
    .from("toefl_item")
    .select("id, task_type, scoring_mode, points, prompt, payload, answer_key, explanation_ko")
    .eq("id", idParsed.data)
    .eq("is_active", true)
    .eq("verified", true)
    .maybeSingle();
  if (!item) return Response.json({ ok: false, message: "문항을 찾을 수 없습니다." }, { status: 404 });

  const isAudioType = AUDIO_TASK_TYPES.has(item.task_type);
  if (isAudioType && !audioBuffer) {
    return Response.json({ ok: false, message: "녹음 파일이 필요합니다." }, { status: 400 });
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let todayCountQuery = service
    .from("toefl_practice_response")
    .select("id", { count: "exact", head: true })
    .eq("task_type", item.task_type)
    .gte("created_at", startOfDay.toISOString());
  todayCountQuery = userId ? todayCountQuery.eq("user_id", userId) : todayCountQuery.eq("guest_id", guestId);
  const { count: todayCount } = await todayCountQuery;
  if ((todayCount ?? 0) >= DAILY_PRACTICE_LIMIT_PER_TYPE) {
    return Response.json(
      { ok: false, message: `이 유형은 하루 ${DAILY_PRACTICE_LIMIT_PER_TYPE}문항까지 연습할 수 있습니다. 내일 다시 시도해주세요.`, limitReached: true },
      { status: 429 }
    );
  }

  const result = await scorePracticeItem(item, {
    answer,
    audioBase64: audioBuffer?.toString("base64"),
    mimeType: audioMime,
  });

  await service.from("toefl_practice_response").insert({
    user_id: userId,
    guest_id: userId ? null : guestId,
    item_id: item.id,
    task_type: item.task_type,
    answer: isAudioType ? null : answer ?? null,
    transcript: result.transcript ?? null,
    is_correct: result.isCorrect,
    points_earned: result.pointsEarned,
    max_points: item.points,
    ai_feedback_ko: result.feedbackKo ?? null,
    ai_rubric: result.rubric ?? null,
  });

  return Response.json({
    ok: true,
    isCorrect: result.isCorrect,
    pointsEarned: result.pointsEarned,
    maxPoints: item.points,
    feedbackKo: result.feedbackKo ?? null,
    rubric: result.rubric ?? null,
    explanationKo: item.explanation_ko ?? null,
    error: result.error ?? null,
  });
}
