import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";
import { createToeflServiceClient } from "@/lib/toefl/server/service-client";
import { resolveCurrentModule } from "@/lib/toefl/server/modules";
import { summarizeSkillTags } from "@/lib/toefl/scoring";
import { ADAPTIVE_SECTIONS } from "@/lib/toefl/section-order";
import type { ToeflRoute, ToeflSection } from "@/lib/toefl/types";

// 리포트 화면의 "영역별 강약점"(§13) + "적응형 라우팅 결과 공개"(§8) 전용 라우트.
// skill_tags는 staff-only 컬럼(toefl_item)이라 service role이 필요하고, 이 집계 자체를
// 클라이언트에서 다시 하지 않기 위해(요청: "리포트를 클라이언트에서 재계산하지 말 것") 서버가
// 계산해서 완성된 요약만 내려준다. 제출 전(in_progress)에는 호출을 막는다 — 아직 안 끝난
// 섹션의 통계를 보여주는 게 의미가 없어서다.
// route(easy/hard)를 여기서 노출하는 건 §8 5번 규칙 위반이 아니다 — 그 규칙은 "응시 중" 클라이언트
// 응답 얘기고, 여긴 제출 후에만 호출 가능한 리포트 전용 라우트다(spec §8 "적응형 라우팅 결과 공개").

const ROUTE_CAP_NOTE: Record<ToeflRoute, string> = {
  easy: "Your Stage 1 score routed you to the standard-difficulty Stage 2 set. Scores on this path are capped at band 4.0.",
  hard: "Your Stage 1 score routed you to the harder Stage 2 set. No score cap applies on this path.",
  base: "",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId } = await params;
  const { client } = auth;

  const { data: attempt } = await client
    .from("toefl_attempt")
    .select("id, user_id, form_id, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");
  if (attempt.status === "in_progress") return jsonError(403, "제출 후에만 확인할 수 있습니다.");

  const { data: sectionAttempts } = await client
    .from("toefl_section_attempt")
    .select("section, routed_to, finished_at")
    .eq("attempt_id", attemptId);
  const finishedSections = (sectionAttempts ?? []).filter((s) => s.finished_at);
  if (finishedSections.length === 0) return Response.json({ ok: true, sections: [] });

  const service = createToeflServiceClient();

  const sections = await Promise.all(
    finishedSections.map(async (sa) => {
      const section = sa.section as ToeflSection;
      const routedTo = sa.routed_to as ToeflRoute | null;

      const modules = ADAPTIVE_SECTIONS.includes(section)
        ? await Promise.all([
            resolveCurrentModule(service, attempt.form_id, section, null),
            routedTo ? resolveCurrentModule(service, attempt.form_id, section, routedTo) : null,
          ])
        : [await resolveCurrentModule(service, attempt.form_id, section, null)];
      const moduleIds = modules.filter((m): m is NonNullable<typeof m> => !!m).map((m) => m.id);

      const { data: items } = moduleIds.length
        ? await service.from("toefl_item").select("id, skill_tags").in("module_id", moduleIds)
        : { data: [] as { id: string; skill_tags: string[] }[] };
      const itemIds = (items ?? []).map((i) => i.id);

      const { data: responses } = itemIds.length
        ? await client.from("toefl_response").select("item_id, is_correct").eq("attempt_id", attemptId).in("item_id", itemIds)
        : { data: [] as { item_id: string; is_correct: boolean | null }[] };

      const skillTagsByItem = new Map((items ?? []).map((i) => [i.id, i.skill_tags ?? []]));
      const entries = (responses ?? []).map((r) => ({
        skillTags: skillTagsByItem.get(r.item_id) ?? [],
        isCorrect: r.is_correct,
      }));
      const { weak, strong } = summarizeSkillTags(entries);

      return {
        section,
        routed_to: routedTo,
        routing_note: routedTo ? ROUTE_CAP_NOTE[routedTo] : null,
        weak_tags: weak,
        strong_tags: strong,
      };
    })
  );

  return Response.json({ ok: true, sections });
}
