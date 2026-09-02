import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/home/Hero";
import TrackSelector from "@/components/home/TrackSelector";
import FlowSteps from "@/components/home/FlowSteps";
import CurriculumChips from "@/components/home/CurriculumChips";
import CtaBand from "@/components/home/CtaBand";
import { pretendardHome } from "@/lib/home-fonts";

// 홈페이지 리디자인(2026-09-02, 지시서 "메인페이지 리디자인 — TOEFL 팔레트 승격").
// 기존 헤더/푸터는 그대로 재사용하고, 본문만 "큰 카테고리 2개(수학/영어)" 구성으로 교체한다.
// 사용자 결정: 두 도메인(pmedu4u.com/english.pmedu4u.com) 모두 동일한 화면을 보여준다 —
// 그래서 예전처럼 getSubject()로 과목별 콘텐츠를 갈라 보여주던 로직은 여기서 더 안 쓴다
// (Header의 수학/English 전환 pill은 그대로 동작 — 그건 이 페이지가 아니라 도메인 이동용).
export default function Home() {
  return (
    <>
      <Header />
      <main
        className={`home-v3 ${pretendardHome.variable}`}
        style={{ fontFamily: "var(--font-pretendard-home), Pretendard, -apple-system, sans-serif" }}
      >
        <Hero />
        <div id="tracks">
          <TrackSelector />
        </div>
        <FlowSteps />
        <CurriculumChips />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
