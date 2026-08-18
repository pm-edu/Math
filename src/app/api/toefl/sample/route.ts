import { createToeflServiceClient } from "@/lib/toefl/server/service-client";

// 문항 미리보기 — 인증 전혀 없이 열어둔다(2026-08-18). "체험 없이 가입해야 시험을 볼 수 있게
// 하되, 가입 전에도 인터페이스는 보여주고 싶다"는 요구를 익명 로그인 없이 처리한다.
// complete_the_words/build_a_sentence 2종만 고른 이유: 둘 다 stimulus(지문)나 오디오가 없는
// 자기완결형 문항이라, 서명된 오디오 URL 발급 같은 별도 로직 없이 그대로 내려줘도 안전하다.
// answer_key/explanation_*는 이 select 목록에 아예 없다 — toefl_item_public 뷰와 동일한
// "정답 절대 노출 금지" 원칙을 여기서도 그대로 지킨다(§5).

const SAMPLE_FORM_CODE = "TOEFL_DEMO_001";
const SAMPLE_TASK_TYPES = ["complete_the_words", "build_a_sentence"] as const;

export async function GET() {
  const service = createToeflServiceClient();

  const { data: form } = await service.from("toefl_form").select("id").eq("code", SAMPLE_FORM_CODE).maybeSingle();
  if (!form) return Response.json({ ok: true, items: [] });

  const { data: modules } = await service.from("toefl_module").select("id").eq("form_id", form.id);
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return Response.json({ ok: true, items: [] });

  const { data: items } = await service
    .from("toefl_item")
    .select("id, module_id, stimulus_id, task_type, position, difficulty, points, scoring_mode, prompt, payload, created_at")
    .in("module_id", moduleIds)
    .in("task_type", SAMPLE_TASK_TYPES)
    .order("task_type");

  return Response.json({ ok: true, items: items ?? [] });
}
