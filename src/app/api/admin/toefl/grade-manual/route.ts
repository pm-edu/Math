import { z } from "zod";
import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { recalcSectionAndAttempt } from "@/lib/toefl/server/recalc-section";
import { aiRubricToPoints } from "@/lib/toefl/scoring";
import { TASK_TYPE_SECTION } from "@/lib/toefl/section-order";
import type { ToeflTaskType } from "@/lib/toefl/types";

// 화면 검토(2026-08-27) [B]: AI 채점이 실패해 status='pending_manual'로 남은 응답을 관리자가
// 직접 채점한다. /admin/toefl/grading-queue의 "수동 채점" 폼이 여기를 호출한다.
// overall_band는 관리자가 직접 입력하지 않고, 제출한 루브릭 항목별 점수의 평균을 서버가
// 0.5 단위로 반올림해 계산한다 — 클라이언트가 둘을 따로 보내면 항목 점수와 overall이
// 어긋날 수 있어(예: 항목은 낮은데 overall만 후하게 우기는 실수) 서버가 유일한 계산 주체다.

const essayRubricSchema = z
  .object({
    task_achievement: z.number().min(0).max(6),
    coherence: z.number().min(0).max(6),
    lexical_resource: z.number().min(0).max(6),
    grammar: z.number().min(0).max(6),
  })
  .strict();

const interviewRubricSchema = z
  .object({
    delivery: z.number().min(0).max(6),
    language_use: z.number().min(0).max(6),
    topic_development: z.number().min(0).max(6),
  })
  .strict();

const bodySchema = z.object({
  scoreId: z.string().uuid(),
  rubric: z.record(z.string(), z.number()),
  feedback: z.string().trim().min(1, "피드백을 입력해 주세요."),
});

const ESSAY_TYPES: ToeflTaskType[] = ["write_an_email", "academic_discussion"];

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "요청 형식이 올바르지 않습니다.");
  const { scoreId, rubric, feedback } = parsed.data;

  // 조회는 관리자 세션 클라이언트(RLS 적용)로 한다 — regrade 라우트와 같은 이유
  // (2026-08-27 재검증 B1, 위쪽 recalc-section.ts와 같은 원칙).
  const { data: score } = await auth.client
    .from("toefl_ai_score")
    .select("id, response_id, status")
    .eq("id", scoreId)
    .maybeSingle();
  if (!score) return jsonError(404, "채점 대기 항목을 찾을 수 없습니다.");
  if (score.status !== "pending_manual") return jsonError(409, "이미 처리된 항목입니다.");

  const { data: response } = await auth.client
    .from("toefl_response")
    .select("id, attempt_id, item_id")
    .eq("id", score.response_id)
    .maybeSingle();
  if (!response) return jsonError(404, "응답을 찾을 수 없습니다.");

  const { data: item } = await auth.client
    .from("toefl_item")
    .select("id, task_type, points")
    .eq("id", response.item_id)
    .maybeSingle();
  if (!item) return jsonError(404, "문항을 찾을 수 없습니다.");

  const taskType = item.task_type as ToeflTaskType;
  const rubricSchema = ESSAY_TYPES.includes(taskType) ? essayRubricSchema : interviewRubricSchema;
  const rubricParsed = rubricSchema.safeParse(rubric);
  if (!rubricParsed.success) {
    return jsonError(400, `이 문항 유형(${taskType})에 맞는 루브릭 항목이 아닙니다: ${rubricParsed.error.issues[0]?.message ?? ""}`);
  }
  const dimensions = Object.values(rubricParsed.data);
  const overallBand = Math.round((dimensions.reduce((sum, v) => sum + v, 0) / dimensions.length) * 2) / 2;
  const points = aiRubricToPoints(overallBand, Number(item.points));

  // 실제 채점 저장은 service client가 필요하다(toefl_response RLS with-check가 본인 행만
  // 허용, regrade 라우트와 같은 이유) — 위에서 이미 RLS로 존재·조회권한을 확인했으므로
  // 여기부터는 쓰기 전용 도구로만 쓴다.
  const service = createToeflServiceClient();
  const { data: updatedScore, error: scoreErr } = await service
    .from("toefl_ai_score")
    .update({
      model: "manual",
      rubric: { ...rubricParsed.data, overall_band: overallBand },
      overall: overallBand,
      feedback_ko: feedback,
      status: "graded",
    })
    .eq("id", scoreId)
    .eq("status", "pending_manual")
    .select("id");
  if (scoreErr) return jsonError(500, `채점 저장에 실패했습니다: ${scoreErr.message}`);
  if (!updatedScore || updatedScore.length === 0) return jsonError(409, "이미 다른 요청이 먼저 처리했습니다.");

  const { error: responseErr } = await service.from("toefl_response").update({ points_earned: points }).eq("id", response.id);
  if (responseErr) return jsonError(500, `응답 점수 저장에 실패했습니다: ${responseErr.message}`);

  const section = TASK_TYPE_SECTION[taskType];
  const recalc = await recalcSectionAndAttempt(service, response.attempt_id, section);
  if (!recalc.ok) return jsonError(500, `채점은 저장됐지만 집계에 실패했습니다: ${recalc.message}`);

  // itemBand: 이 응답 하나의 루브릭 평균 밴드(포인트 환산에 쓴 값). recalc.section/overall은
  // 재집계된 실제 영역·응시 점수 — 이름이 헷갈리지 않게 분리해서 내려준다(3차 검토 [C]-5).
  return Response.json({
    ok: true,
    attemptId: response.attempt_id,
    itemBand: overallBand,
    points,
    section: recalc.section,
    overall: recalc.overall,
  });
}
