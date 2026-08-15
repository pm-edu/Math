import { z } from "zod";
import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { fetchBlueprint, resolveCurrentModule } from "@/lib/toefl/server/modules";

// 시험 시작. docs/toefl-spec.md §9.
// P1 범위: reading 단독 연습만 실제로 동작한다(다른 영역은 P2~P4에서 이어짐).
// mode='full'이어도 지금은 reading부터 시작한다(§2: 고정 순서 R→L→S→W).
const bodySchema = z.object({
  form_id: z.string().uuid(),
  mode: z.enum(["full", "section_practice"]),
  section: z.enum(["reading", "listening", "speaking", "writing"]).optional(),
});

export async function POST(req: Request) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");
  const { form_id, mode } = parsed.data;

  const targetSection = mode === "section_practice" ? parsed.data.section ?? "reading" : "reading";
  if (targetSection !== "reading") {
    return jsonError(400, "Reading 영역만 아직 응시할 수 있습니다. (다른 영역은 준비 중입니다)");
  }

  const { client } = auth;

  const { data: form } = await client
    .from("toefl_form")
    .select("id, blueprint_version")
    .eq("id", form_id)
    .maybeSingle();
  if (!form) return jsonError(404, "시험 폼을 찾을 수 없습니다.");

  const blueprint = await fetchBlueprint(client, form.blueprint_version, "reading", "stage1", "base");
  if (!blueprint) return jsonError(500, "시험 구성(블루프린트)이 없습니다.");

  const { data: attempt, error: attemptErr } = await client
    .from("toefl_attempt")
    .insert({ user_id: auth.userId, form_id, mode, status: "in_progress" })
    .select("id")
    .single();
  if (attemptErr || !attempt) return jsonError(500, `시험을 시작하지 못했습니다: ${attemptErr?.message}`);

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, form_id, "reading", null);
  if (!module) return jsonError(500, "Reading 모듈을 찾을 수 없습니다.");

  const now = Date.now();
  const deadlineAt = new Date(now + blueprint.time_limit_sec * 1000).toISOString();

  const { error: sectionErr } = await client.from("toefl_section_attempt").insert({
    attempt_id: attempt.id,
    section: "reading",
    started_at: new Date(now).toISOString(),
    deadline_at: deadlineAt,
  });
  if (sectionErr) return jsonError(500, `영역 시작에 실패했습니다: ${sectionErr.message}`);

  return Response.json({ ok: true, attempt_id: attempt.id, section: "reading" });
}
