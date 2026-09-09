import { createPublicClient } from "@/lib/supabase/server";
import type { ReportPreviewProps } from "@/components/home/ReportPreview";

// 홈 히어로의 "이번 주 리포트" 예시 카드 — 관리자가 공지처럼 수정할 수 있게
// site_settings(key="hero_report_preview")에 JSON으로 저장한다(src/app/admin/settings).
// 값이 없거나 형태가 안 맞으면 조용히 undefined를 돌려줘 ReportPreview의 기본값(시안 예시)이
// 대신 쓰이게 한다 — 홈 화면이 이 설정 하나 때문에 깨지면 안 된다.
export const HERO_REPORT_KEY = "hero_report_preview";

export async function getHeroReportSettings(): Promise<Partial<ReportPreviewProps> | undefined> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("value")
    .eq("key", HERO_REPORT_KEY)
    .maybeSingle();
  if (!data?.value) return undefined;
  try {
    const parsed = JSON.parse(data.value);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as Partial<ReportPreviewProps>;
  } catch {
    return undefined;
  }
}
