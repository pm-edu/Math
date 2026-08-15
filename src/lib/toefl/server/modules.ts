import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToeflRoute, ToeflSection, ToeflStage } from "../types";

export type ResolvedModule = { id: string; stage: ToeflStage; route: ToeflRoute; position: number };

// 현재 응시자가 있어야 할 모듈을 판정한다(spec §8 적응형 라우팅).
// - 아직 stage2로 라우팅되지 않았으면(routed_to null) 항상 stage1/base.
// - 라우팅됐으면 stage2의 해당 route.
// toefl_module은 학생에게 직접 조회 권한이 없어(RLS 직원 전용) service client로 조회해야 한다.
// 반환값에 route를 포함하지만, 이 값을 그대로 클라이언트 응답에 넣으면 안 된다(§8: 클라이언트에
// 어느 경로인지 알려주지 않는다) — 호출자가 route 필드를 걸러내고 넘길 것.
export async function resolveCurrentModule(
  service: SupabaseClient,
  formId: string,
  section: ToeflSection,
  routedTo: ToeflRoute | null
): Promise<ResolvedModule | null> {
  const stage: ToeflStage = routedTo ? "stage2" : "stage1";
  const route: ToeflRoute = routedTo ?? "base";

  const { data, error } = await service
    .from("toefl_module")
    .select("id, position")
    .eq("form_id", formId)
    .eq("section", section)
    .eq("stage", stage)
    .eq("route", route)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, stage, route, position: data.position };
}

export type BlueprintRow = { time_limit_sec: number; item_count: number; task_mix: Record<string, number> };

// toefl_form_blueprint는 로그인 사용자 전원 읽기 허용이라 service client 없이도 되지만,
// 다른 모듈 조회와 나란히 쓰기 편하도록 이 파일에 같이 둔다.
export async function fetchBlueprint(
  client: SupabaseClient,
  blueprintVersion: string,
  section: ToeflSection,
  stage: ToeflStage,
  route: ToeflRoute
): Promise<BlueprintRow | null> {
  const { data, error } = await client
    .from("toefl_form_blueprint")
    .select("time_limit_sec, item_count, task_mix")
    .eq("version", blueprintVersion)
    .eq("section", section)
    .eq("stage", stage)
    .eq("route", route)
    .maybeSingle();

  if (error || !data) return null;
  return data as BlueprintRow;
}
