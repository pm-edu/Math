import { z } from "zod";
import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { fetchBlueprint, resolveCurrentModule } from "@/lib/toefl/server/modules";

// 시험 시작. docs/toefl-spec.md §9.
// P1~P4 범위: reading·listening·writing·speaking 단독 연습이 동작한다.
// mode='full'이어도 지금은 reading부터 시작한다(§2: 고정 순서 R→L→S→W).
const SUPPORTED_SECTIONS = ["reading", "listening", "writing", "speaking"] as const;
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
  if (!SUPPORTED_SECTIONS.includes(targetSection as (typeof SUPPORTED_SECTIONS)[number])) {
    return jsonError(400, "지원하지 않는 영역입니다.");
  }

  const { client } = auth;

  const { data: form } = await client
    .from("toefl_form")
    .select("id, blueprint_version")
    .eq("id", form_id)
    .maybeSingle();
  if (!form) return jsonError(404, "시험 폼을 찾을 수 없습니다.");

  const blueprint = await fetchBlueprint(client, form.blueprint_version, targetSection, "stage1", "base");
  if (!blueprint) return jsonError(500, "시험 구성(블루프린트)이 없습니다.");

  const { data: attempt, error: attemptErr } = await client
    .from("toefl_attempt")
    .insert({ user_id: auth.userId, form_id, mode, status: "in_progress" })
    .select("id")
    .single();
  if (attemptErr || !attempt) return jsonError(500, `시험을 시작하지 못했습니다: ${attemptErr?.message}`);

  const service = createToeflServiceClient();
  const module = await resolveCurrentModule(service, form_id, targetSection, null);
  if (!module) return jsonError(500, "모듈을 찾을 수 없습니다.");

  const now = Date.now();
  const deadlineAt = new Date(now + blueprint.time_limit_sec * 1000).toISOString();

  const { error: sectionErr } = await client.from("toefl_section_attempt").insert({
    attempt_id: attempt.id,
    section: targetSection,
    started_at: new Date(now).toISOString(),
    deadline_at: deadlineAt,
  });
  if (sectionErr) return jsonError(500, `영역 시작에 실패했습니다: ${sectionErr.message}`);

  return Response.json({ ok: true, attempt_id: attempt.id, section: targetSection });
}
