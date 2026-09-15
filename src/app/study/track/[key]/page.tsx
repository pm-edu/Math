import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { MATH_PROGRAMS } from "@/components/home/data";
import { getTrackAvailability, TRACK_KEYS, type TrackKey } from "@/lib/home/trackAvailability";
import TrackPageBody from "./TrackPageBody";

// 홈페이지 수학 트랙 카드의 실제 진입점(quirky-percolating-storm 계획). 트랙 7개 전부 이 라우트
// 하나로 처리 — curriculum_detail별로 콘텐츠 유무가 갈려도(예: 중등 안에서 중1은 준비중, 중2/중3은
// 서비스중) 라우트 자체는 분기 없이 trackAvailability의 결과를 그대로 보여주기만 한다.

export default async function TrackPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!TRACK_KEYS.includes(key as TrackKey)) notFound();

  const trackKey = key as TrackKey;
  const program = MATH_PROGRAMS.find((p) => p.id === trackKey);
  if (!program) notFound();

  const availability = await getTrackAvailability(trackKey);
  if (!availability) notFound();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <TrackPageBody trackKey={trackKey} program={program} availability={availability} />
      </main>
      <Footer />
    </>
  );
}

export function generateStaticParams() {
  return TRACK_KEYS.map((key) => ({ key }));
}
