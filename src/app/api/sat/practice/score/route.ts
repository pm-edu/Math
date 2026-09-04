import { z } from "zod";
import { requireSatUser } from "@/lib/sat/server/auth";
import { createSatServiceClient } from "@/lib/sat/server/service-client";
import { gradeResponse, type AnswerKey } from "@/lib/sat/grade";
import type { Rational } from "@/lib/sat/spr";

// SAT 유형별 연습 채점. TOEFL의 practice/score와 같은 역할이지만, 지금은 로그인 사용자만
// 지원한다(게스트 기록 테이블을 새로 만들지 않기 위한 범위 제한 — src/lib/sat/server/auth.ts 참고).
// 이 라우트 말고는 answer_key/explanation_ko를 볼 수 있는 경로가 없다(sat_questions_public
// 뷰는 이 두 컬럼을 아예 안 내려준다).

const bodySchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string(),
});

type DbRational = { n: string; d: string };
type DbAnswerKey =
  | { type: "mcq"; correct: string }
  | { type: "spr"; accepted: DbRational[]; tolerance: { min: DbRational; max: DbRational } | null };

function toRational(r: DbRational): Rational {
  return { n: BigInt(r.n), d: BigInt(r.d) };
}

function toGradeKey(raw: DbAnswerKey): AnswerKey {
  if (raw.type === "mcq") return { type: "mcq", correct: raw.correct };
  return {
    type: "spr",
    accepted: raw.accepted.map(toRational),
    tolerance: raw.tolerance ? { min: toRational(raw.tolerance.min), max: toRational(raw.tolerance.max) } : undefined,
  };
}

export async function POST(req: Request) {
  const auth = await requireSatUser(req);
  if (!auth.ok) return Response.json({ ok: false, message: auth.message }, { status: auth.status });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });

  const service = createSatServiceClient();
  const { data: question } = await service
    .from("sat_questions")
    .select("id, format, answer_key, explanation_ko")
    .eq("id", parsed.data.questionId)
    .eq("verified", true)
    .maybeSingle();
  if (!question) return Response.json({ ok: false, message: "문항을 찾을 수 없습니다." }, { status: 404 });

  const key = toGradeKey(question.answer_key as DbAnswerKey);
  const result = gradeResponse(key, parsed.data.answer);

  return Response.json({
    ok: true,
    isCorrect: result.isCorrect,
    normalized: result.normalized,
    explanationKo: question.explanation_ko,
  });
}
