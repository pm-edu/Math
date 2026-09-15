import { createServiceClient } from "@/lib/supabase/service";
import { CURRICULUM_DETAILS, curriculumDetailLabel, type CurriculumGroup } from "@/lib/curriculum";

// 홈페이지 수학 트랙 카드(7개)와 실제 문제은행(problems.curriculum_detail) 사이의 매핑 +
// "이 트랙/과정이 실제로 서비스 중인가"를 실제 데이터로 판정한다(quirky-percolating-storm 계획).

export type TrackKey = "elementary" | "middle" | "high" | "ib" | "igcse" | "aslevel" | "cbse";

export const TRACK_KEYS: TrackKey[] = ["elementary", "middle", "high", "ib", "igcse", "aslevel", "cbse"];

const TRACK_GROUP: Record<TrackKey, CurriculumGroup> = {
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

function detailValuesForTrack(track: TrackKey): string[] {
  const group = TRACK_GROUP[track];
  const all = CURRICULUM_DETAILS[group].map((d) => d.value);
  if (track === "elementary") return all.filter((v) => KR_ELEMENTARY.includes(v));
  if (track === "middle") return all.filter((v) => KR_MIDDLE.includes(v));
  if (track === "high") return all.filter((v) => !KR_ELEMENTARY.includes(v) && !KR_MIDDLE.includes(v));
  return all; // ib/igcse/aslevel/cbse는 그룹 전체가 트랙 하나
}

// 과정 하나가 "지금 바로 공부할 만큼" 문항이 있는지 가르는 컷오프. 결제·접근권 판정이 아니라
// 순수 안내용 뱃지라 엄밀한 근거는 없음 — 5개(대수)는 "준비 중", 280개 이상(중2/중3)은
// "서비스 중"으로 갈리도록 잡은 값. 실제 데이터가 애매한 경계로 바뀌면 같이 조정할 것.
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
  const { data, error } = await supabase
    .from("problems")
    .select("curriculum_detail")
    .eq("subject", "math")
    .eq("verified", true);

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
