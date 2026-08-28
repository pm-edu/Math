import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { pickPracticeItems } from "@/lib/toefl/server/practice";
import { isToeflTaskType } from "@/lib/toefl/task-types";

// 유형별 연습 문항 조회 — 인증 전혀 없이 열어둔다(2026-08-28, /toefl/sample과 같은 원칙:
// answer_key/explanation_*는 select 목록에 없어 정답 노출 걱정이 없다). 오디오가 있는 유형도
// signed URL을 그대로 내려준다 — 게스트도 12유형 전부 체험 가능하게 하기로 확정함
// (toefl-subsystem-plan 메모 2026-08-28).

const PRACTICE_ROUND_SIZE = 5;

export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isToeflTaskType(type)) {
    return Response.json({ ok: false, message: "알 수 없는 문항 유형입니다." }, { status: 400 });
  }

  const service = createToeflServiceClient();
  const { items, stimuli } = await pickPracticeItems(service, type, PRACTICE_ROUND_SIZE);

  return Response.json({ ok: true, items, stimuli });
}
