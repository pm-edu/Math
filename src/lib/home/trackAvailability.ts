import { createServiceClient } from "@/lib/supabase/service";
import { CURRICULUM_DETAILS, curriculumDetailLabel, type CurriculumGroup } from "@/lib/curriculum";

// 홈페이지 수학 트랙 카드(7개)와 실제 문제은행(problems.curriculum_detail) 사이의 매핑 +
// "이 트랙/과정이 실제로 서비스 중인가"를 실제 데이터로 판정한다(quirky-percolating-storm 계획).

export type TrackKey = "elementary" | "middle" | "high" | "ib" | "igcse" | "aslevel" | "cbse";

export const TRACK_KEYS: TrackKey[] = ["elementary", "middle", "high", "ib", "igcse", "aslevel", "cbse"];

export const TRACK_GROUP: Record<TrackKey, CurriculumGroup> = {
  elementary: "KR",
  middle: "KR",
  high: "KR",
  ib: "IB",
  igcse: "IGCSE",
  aslevel: "AS_A_Level",
  cbse: "CBSE",
};

const KR_ELEMENTARY = ["초1", "초2", "초3", "초4", "초5", "초6"];
const KR_MIDDLE = ["중1", "중2", "중3"];

export function detailValuesForTrack(track: TrackKey): string[] {
  const group = TRACK_GROUP[track];
  const all = CURRICULUM_DETAILS[group].map((d) => d.value);
  if (track === "elementary") return all.filter((v) => KR_ELEMENTARY.includes(v));
  if (track === "middle") return all.filter((v) => KR_MIDDLE.includes(v));
  if (track === "high") return all.filter((v) => !KR_ELEMENTARY.includes(v) && !KR_MIDDLE.includes(v));
  return all; // ib/igcse/aslevel/cbse는 그룹 전체가 트랙 하나
}

// 과정 하나가 "지금 바로 공부할 만큼" 문항이 있는지 가르는 컷오프(아래 쿼리로 이미 진단·세션이
// 실제로 쓸 수 있는 문항만 센 값 기준). 결제·접근권 판정이 아니라 순수 안내용 뱃지라 정확한
// 근거는 없는 여유값 — 지금 유일하게 조건을 만족하는 IGCSE_0607(346개)은 압도적으로 넘김.
const MIN_VERIFIED_PROBLEMS = 20;

export interface DetailAvailability {
  value: string;
  label: string;
  problemCount: number;
  status: "live" | "soon";
}

export interface TrackAvailability {
  status: "live" | "soon"; // details 중 하나라도 live면 live
  details: DetailAvailability[];
}

export async function getAllTrackAvailability(): Promise<Record<TrackKey, TrackAvailability>> {
  const supabase = createServiceClient();
  // verified=true만으론 부족하다 — 실제 진단/세션(src/lib/math/server/diagnostic.ts의
  // pickItemForUnit)이 쓸 수 있으려면 unit_id가 있고 is_auto_gradable=true(자동채점 가능한
  // mcq/numeric)이어야 한다. 중2/중3의 검수된 문항 수백 개는 [[math-figure-bulk-generation-project]]
  // 파이프라인(이미지 기반 문제지 배포용)으로 만들어져 이 조건을 전혀 만족 안 함 — 2026-09-15
  // 발견, verified만 세던 이전 버전은 "학습 시작하기"가 죽은 링크가 되는 버그였음.
  const { data, error } = await supabase
    .from("problems")
    .select("curriculum_detail")
    .eq("subject", "math")
    .eq("verified", true)
    .eq("is_auto_gradable", true)
    .not("unit_id", "is", null);

  const counts = new Map<string, number>();
  if (!error && data) {
    for (const row of data as { curriculum_detail: string | null }[]) {
      if (!row.curriculum_detail) continue;
      counts.set(row.curriculum_detail, (counts.get(row.curriculum_detail) ?? 0) + 1);
    }
  }

  const result = {} as Record<TrackKey, TrackAvailability>;
  for (const track of TRACK_KEYS) {
    const group = TRACK_GROUP[track];
    const details: DetailAvailability[] = detailValuesForTrack(track).map((value) => {
      const problemCount = counts.get(value) ?? 0;
      return {
        value,
        label: curriculumDetailLabel(group, value),
        problemCount,
        status: problemCount >= MIN_VERIFIED_PROBLEMS ? "live" : "soon",
      };
    });
    result[track] = { status: details.some((d) => d.status === "live") ? "live" : "soon", details };
  }
  return result;
}

export async function getTrackAvailability(track: TrackKey): Promise<TrackAvailability | null> {
  if (!TRACK_KEYS.includes(track)) return null;
  const all = await getAllTrackAvailability();
  return all[track];
}
