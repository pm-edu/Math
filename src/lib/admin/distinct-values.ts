// 문제은행 필터·문제지 만들기 화면에서 쓰는, "실제로 등록된 값" 목록 조회.
// category(SAT 등 CATEGORIES 상수에 없는 값도 포함)/course_level/unit은 전부 자유값이라
// 고정 목록 대신 DB에 실제로 있는 값만 보여줘야 빠뜨리는 게 없다.

import { createClient } from "@/lib/supabase/client";

export async function fetchDistinctValues(params: {
  subject: string;
  column: "category" | "course_level" | "unit";
  category?: string[];
  courseLevel?: string[];
}): Promise<string[]> {
  const supabase = createClient();
  let q = supabase
    .from("problems")
    .select(params.column)
    .eq("subject", params.subject)
    .eq("verified", true)
    .not(params.column, "is", null);
  if (params.column !== "category" && params.category?.length) q = q.in("category", params.category);
  if (params.column === "unit" && params.courseLevel?.length) q = q.in("course_level", params.courseLevel);
  const { data } = await q.limit(3000);
  const set = new Set<string>();
  (data ?? []).forEach((r) => {
    const v = (r as Record<string, string | null>)[params.column];
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}
