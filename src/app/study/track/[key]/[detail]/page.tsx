import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createServiceClient } from "@/lib/supabase/service";
import { getTrackAvailability, TRACK_KEYS, type TrackKey } from "@/lib/home/trackAvailability";
import DetailPageBody, { type UnitTopic } from "./DetailPageBody";

// 서브메뉴(학년/과정) 페이지 — 트랙 페이지에서 학년/과정을 고르면 여기로 온다. 즉석 학습 진입이
// 아니라 단원(토픽) 목록 + "신청" 버튼만 보여준다(quirky-percolating-storm 계획의 2차 방향 전환,
// 2026-09-15). 단원별 샘플은 화면에 텍스트로 늘어놓지 않고 PDF로 제공한다(2026-09-15 사용자
// 피드백: "지금처럼 보여지는 문제는 어수선하다" — 기존 실전시험 PDF 시스템 재사용, DetailPageBody의
// PDF 버튼이 /api/study/sample-pdf를 호출). 단원 매칭은 problems.unit_id(FK)가 아니라 problems.unit
// (자유텍스트) ↔ curriculum_units.unit_name 텍스트 일치로 한다 — 중2/중3 문항은 unit_id가 전혀
// 없어서([[math-figure-bulk-generation-project]] 파이프라인 산출물) 이 방법이어야 전부 커버된다.

interface UnitRow {
  id: string;
  unit_name: string;
  sort_order: number;
}

export default async function TrackDetailPage({ params }: { params: Promise<{ key: string; detail: string }> }) {
  const { key, detail: rawDetail } = await params;
  const detail = decodeURIComponent(rawDetail);
  if (!TRACK_KEYS.includes(key as TrackKey)) notFound();

  const trackKey = key as TrackKey;
  const availability = await getTrackAvailability(trackKey);
  const detailInfo = availability?.details.find((d) => d.value === detail);
  if (!detailInfo) notFound();

  const db = createServiceClient();
  const [{ data: units }, { data: problemUnits }] = await Promise.all([
    db
      .from("curriculum_units")
      .select("id, unit_name, sort_order")
      .eq("curriculum_detail", detail)
      .not("unit_name", "ilike", "%코스워크%")
      .order("sort_order") as unknown as Promise<{ data: UnitRow[] | null }>,
    db.from("problems").select("unit").eq("curriculum_detail", detail).eq("verified", true) as unknown as Promise<{
      data: { unit: string | null }[] | null;
    }>,
  ]);

  const unitsWithContent = new Set((problemUnits ?? []).map((p) => p.unit).filter((v): v is string => !!v));

  const topics: UnitTopic[] = (units ?? []).map((u) => ({
    unitName: u.unit_name,
    hasSample: unitsWithContent.has(u.unit_name),
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <DetailPageBody trackKey={trackKey} detail={detail} detailLabel={detailInfo.label} topics={topics} />
      </main>
      <Footer />
    </>
  );
}

export async function generateStaticParams() {
  const params: { key: string; detail: string }[] = [];
  for (const key of TRACK_KEYS) {
    const availability = await getTrackAvailability(key);
    for (const d of availability?.details ?? []) {
      params.push({ key, detail: d.value });
    }
  }
  return params;
}
