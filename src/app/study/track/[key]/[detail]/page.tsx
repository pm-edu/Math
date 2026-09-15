import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createServiceClient } from "@/lib/supabase/service";
import { getTrackAvailability, TRACK_KEYS, type TrackKey } from "@/lib/home/trackAvailability";
import DetailPageBody, { type UnitPreview } from "./DetailPageBody";

// 서브메뉴(학년/과정) 페이지 — 트랙 페이지에서 학년/과정을 고르면 여기로 온다. 즉석 학습 진입이
// 아니라 단원 목록 + 단원별 샘플 문제 미리보기 + "신청" 버튼만 보여준다(quirky-percolating-storm
// 계획의 2차 방향 전환, 2026-09-15). 단원 매칭은 problems.unit_id(FK)가 아니라 problems.unit
// (자유텍스트) ↔ curriculum_units.unit_name 텍스트 일치로 한다 — 중2/중3 문항은 unit_id가 전혀
// 없어서([[math-figure-bulk-generation-project]] 파이프라인 산출물) 이 방법이어야 전부 커버된다.
// IGCSE_0607도 unit 텍스트가 항상 unit_name과 일치해서 같은 로직으로 문제없이 동작함(확인됨).

const SAMPLE_PER_UNIT = 2;

interface UnitRow {
  id: string;
  unit_name: string;
  sort_order: number;
}

interface ProblemRow {
  id: string;
  unit: string | null;
  content_text: string | null;
  image_url: string | null;
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
  const [{ data: units }, { data: problems }] = await Promise.all([
    db
      .from("curriculum_units")
      .select("id, unit_name, sort_order")
      .eq("curriculum_detail", detail)
      .not("unit_name", "ilike", "%코스워크%")
      .order("sort_order") as unknown as Promise<{ data: UnitRow[] | null }>,
    db
      .from("problems")
      .select("id, unit, content_text, image_url")
      .eq("curriculum_detail", detail)
      .eq("verified", true) as unknown as Promise<{ data: ProblemRow[] | null }>,
  ]);

  const byUnitName = new Map<string, ProblemRow[]>();
  for (const p of problems ?? []) {
    if (!p.unit) continue;
    const list = byUnitName.get(p.unit) ?? [];
    if (list.length < SAMPLE_PER_UNIT) list.push(p);
    byUnitName.set(p.unit, list);
  }

  const unitPreviews: UnitPreview[] = (units ?? []).map((u) => ({
    unitName: u.unit_name,
    samples: (byUnitName.get(u.unit_name) ?? []).map((p) => ({
      id: p.id,
      contentText: p.content_text,
      imageUrl: p.image_url,
    })),
  }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <DetailPageBody trackKey={trackKey} detail={detail} detailLabel={detailInfo.label} units={unitPreviews} />
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
