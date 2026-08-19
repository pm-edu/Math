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

// 모듈 안 문항이 블루프린트 목표치보다 많아질 수 있다(관리자가 계속 등록하므로, P6).
// 그래서 매 attempt마다 "이 모듈에 있는 문항 전부"가 아니라, task_mix가 정한 유형별 개수만큼
// 무작위로 뽑아 구성한다. 같은 attempt 안에서는(새로고침해도) 항상 같은 조합이어야 하므로
// 한 번 뽑은 결과를 toefl_attempt_item_selection에 저장해두고 이후엔 그대로 재사용한다
// ("저장하고 불러쓰는" 요구사항 — 매번 다시 뽑지 않음, 문항이 아무리 많아져도 이 조회는
// module_id+task_type로 좁혀진 id 목록만 가져오므로 가볍다).
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function resolveModuleItemIds(
  service: SupabaseClient,
  attemptId: string,
  moduleId: string,
  section: ToeflSection,
  stage: ToeflStage,
  route: ToeflRoute,
  blueprintVersion: string
): Promise<string[]> {
  const { data: existing } = await service
    .from("toefl_attempt_item_selection")
    .select("item_ids")
    .eq("attempt_id", attemptId)
    .eq("module_id", moduleId)
    .maybeSingle();
  if (existing) return (existing.item_ids as string[]) ?? [];

  const blueprint = await fetchBlueprint(service, blueprintVersion, section, stage, route);
  const taskMix = { ...(blueprint?.task_mix ?? {}) };
  delete taskMix.routing_threshold;

  let selected: string[] = [];
  const taskTypes = Object.keys(taskMix);
  if (taskTypes.length > 0) {
    for (const taskType of taskTypes) {
      const count = Number(taskMix[taskType]) || 0;
      if (count <= 0) continue;
      const { data: pool } = await service
        .from("toefl_item")
        .select("id")
        .eq("module_id", moduleId)
        .eq("task_type", taskType)
        .eq("is_active", true);
      const ids = shuffle((pool ?? []).map((p) => p.id as string)).slice(0, count);
      selected.push(...ids);
    }
  }
  // 블루프린트에 이 모듈의 task_mix가 없거나(설정 누락) 문항이 하나도 안 걸렸으면, 예전처럼
  // 모듈에 있는 활성 문항 전부를 쓴다(시험이 아예 비는 것보다 낫다).
  if (selected.length === 0) {
    const { data: fallback } = await service.from("toefl_item").select("id").eq("module_id", moduleId).eq("is_active", true);
    selected = (fallback ?? []).map((f) => f.id as string);
  }

  const { error: insertErr } = await service
    .from("toefl_attempt_item_selection")
    .insert({ attempt_id: attemptId, module_id: moduleId, item_ids: selected });
  if (insertErr) {
    // 동시 요청으로 이미 다른 쪽이 먼저 저장했을 수 있다(unique(attempt_id, module_id)) — 그걸 그대로 쓴다.
    const { data: raceWinner } = await service
      .from("toefl_attempt_item_selection")
      .select("item_ids")
      .eq("attempt_id", attemptId)
      .eq("module_id", moduleId)
      .maybeSingle();
    if (raceWinner) return (raceWinner.item_ids as string[]) ?? [];
  }

  return selected;
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
