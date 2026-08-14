// 중복 문제 탐지(STAGE 7, 기본 수준). 완벽한 유사도 분석은 하지 않는다 —
// "같은 배치(연속 등록/추출 시점)에서 만들어진 문제 중 본문 텍스트가 거의 같은 것"만 찾아 표시한다.
// 텍스트가 있는 문제(content_text)만 대상 — 이미지로만 등록된 문제는 비교 대상 아님.

import { createClient } from "@/lib/supabase/client";

const BATCH_GAP_MS = 5 * 60 * 1000; // 같은 배치로 볼 시간 간격(5분)
const SIMILARITY_THRESHOLD = 0.8; // 단어 겹침 비율 — 이 이상이면 "중복 의심"

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wa = new Set(normalize(a).split(" ").filter(Boolean));
  const wb = new Set(normalize(b).split(" ").filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let intersect = 0;
  wa.forEach((w) => { if (wb.has(w)) intersect++; });
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : intersect / union;
}

export type DuplicateSuspect = { id: string; preview: string; createdAt: string };
export type DuplicateGroup = { problems: DuplicateSuspect[] };

export async function findDuplicateSuspects(subject: string): Promise<DuplicateGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("problems")
    .select("id, content_text, created_at, source")
    .eq("subject", subject)
    .not("content_text", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; content_text: string; created_at: string; source: string | null }[];

  // 같은 source가 5분 이내로 연속되면 "같은 배치"로 묶는다.
  const batches: (typeof rows)[] = [];
  let current: typeof rows = [];
  for (const row of rows) {
    if (current.length === 0) { current = [row]; continue; }
    const prev = current[current.length - 1];
    const gap = new Date(row.created_at).getTime() - new Date(prev.created_at).getTime();
    if (row.source === prev.source && gap <= BATCH_GAP_MS) current.push(row);
    else { batches.push(current); current = [row]; }
  }
  if (current.length) batches.push(current);

  const groups: DuplicateGroup[] = [];
  for (const batch of batches) {
    if (batch.length < 2) continue;
    const used = new Set<number>();
    for (let i = 0; i < batch.length; i++) {
      if (used.has(i)) continue;
      const clusterIdx = [i];
      for (let j = i + 1; j < batch.length; j++) {
        if (used.has(j)) continue;
        if (jaccardSimilarity(batch[i].content_text, batch[j].content_text) >= SIMILARITY_THRESHOLD) {
          clusterIdx.push(j);
          used.add(j);
        }
      }
      if (clusterIdx.length > 1) {
        used.add(i);
        groups.push({
          problems: clusterIdx.map((k) => ({
            id: batch[k].id,
            preview: batch[k].content_text.slice(0, 100),
            createdAt: batch[k].created_at,
          })),
        });
      }
    }
  }
  return groups;
}
