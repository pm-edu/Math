// 폼(세트)의 "블루프린트 슬롯 충족" 계산. docs/toefl-admin.html 의 세트·배포 뷰가 쓴다.
//
// 블루프린트(toefl_form_blueprint)가 "이 버전은 각 영역·단계·경로에 몇 문항이 필요한지"를
// 정하고, 실제 문항(toefl_item)은 모듈(toefl_module)에 달려 있다. 둘을 맞대어 부족분을 낸다.
// 시간·문항수를 화면에 하드코딩하지 않는다는 규칙(spec §2)을 여기서도 그대로 지킨다.
//
// 순수 함수만 둔다 — Supabase 조회는 화면이 하고, 결과 행만 넘겨받는다(테스트 가능).

import type { ToeflSection } from "@/lib/toefl/types";
import { catalogEntry } from "@/lib/toefl/task-catalog";

export type BlueprintRow = {
  section: ToeflSection;
  stage: string;
  route: string;
  item_count: number;
  task_mix: Record<string, number>;
};

export type ModuleRow = { id: string; section: ToeflSection; stage: string; route: string };

/**
 * task_mix 에는 문항 유형 말고 설정값도 섞여 있다 — 예: routing_threshold(다음 단계
 * 난이도를 가르는 기준 점수)는 "6문항"이 아니라 "6점"이다. 카탈로그에 있는 유형만
 * 문항 수로 센다. 그러지 않으면 영원히 채울 수 없는 부족분이 화면에 남는다.
 */
function isTaskType(key: string): boolean {
  return catalogEntry(key) !== null;
}

/** 모듈별 실제 문항 수. { [module_id]: { [task_type]: 개수 } } */
export type ItemCounts = Record<string, Record<string, number>>;

export type SlotStatus = {
  moduleId: string | null; // 블루프린트에만 있고 모듈이 아직 없으면 null
  section: ToeflSection;
  stage: string;
  route: string;
  required: number;
  actual: number;
  /** 유형별 부족분 — "무엇을 더 만들어야 하는지"를 바로 보여주기 위한 것 */
  shortages: { taskType: string; required: number; actual: number }[];
};

function key(section: string, stage: string, route: string) {
  return `${section}|${stage}|${route}`;
}

/**
 * 블루프린트 · 모듈 · 문항수를 맞대어 슬롯 현황을 만든다.
 * 정렬은 블루프린트가 준 순서를 그대로 따른다(영역 순서는 호출부에서 정한다).
 */
export function buildSlotStatus(
  blueprint: BlueprintRow[],
  modules: ModuleRow[],
  itemCounts: ItemCounts
): SlotStatus[] {
  const moduleByKey = new Map(modules.map((m) => [key(m.section, m.stage, m.route), m]));

  return blueprint.map((b) => {
    const mod = moduleByKey.get(key(b.section, b.stage, b.route)) ?? null;
    const counts = mod ? (itemCounts[mod.id] ?? {}) : {};
    const actual = Object.values(counts).reduce((sum, n) => sum + n, 0);

    const shortages = Object.entries(b.task_mix)
      .filter(([taskType]) => isTaskType(taskType))
      .map(([taskType, required]) => ({ taskType, required, actual: counts[taskType] ?? 0 }))
      .filter((s) => s.actual < s.required);

    return {
      moduleId: mod?.id ?? null,
      section: b.section,
      stage: b.stage,
      route: b.route,
      required: b.item_count,
      actual,
      shortages,
    };
  });
}

/** 모든 슬롯이 채워졌는가 — 폼 게시 가능 여부 판단에 쓴다. */
export function isFormComplete(slots: SlotStatus[]): boolean {
  return slots.length > 0 && slots.every((s) => s.actual >= s.required && s.shortages.length === 0);
}

/** 부족한 문항 총 개수 (게시 버튼 라벨용). */
export function totalShortage(slots: SlotStatus[]): number {
  return slots.reduce((sum, s) => sum + Math.max(0, s.required - s.actual), 0);
}
