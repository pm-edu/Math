import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Hero from "@/components/home/Hero";
import TrackSelector from "@/components/home/TrackSelector";
import CurriculumChips from "@/components/home/CurriculumChips";
import CtaBand from "@/components/home/CtaBand";
import { pretendardHome } from "@/lib/home-fonts";

// 홈페이지 리디자인(2026-09-02, 지시서 "메인페이지 리디자인 — TOEFL 팔레트 승격").
// 기존 헤더/푸터는 그대로 재사용하고, 본문만 "큰 카테고리 2개(수학/영어)" 구성으로 교체한다.
// 사용자 결정: 두 도메인(pmedu4u.com/english.pmedu4u.com) 모두 동일한 화면을 보여준다 —
// 그래서 예전처럼 getSubject()로 과목별 콘텐츠를 갈라 보여주던 로직은 여기서 더 안 쓴다.
// 헤더의 수학/영어 전환 pill은 이 화면의 과목 선택 카드(TrackSelector)와 중복이라
// 2026-09-09에 제거함 — 과목 전환은 이 카드와 푸터 링크로 한다.
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
        {/* 2026-10-02 응급처치: "한 학기가 이렇게 굴러갑니다" 4단계 섹션(FlowSteps)은 진단·매주 리포트
            약속이 들어 있어 숨김. 컴포넌트 파일은 그대로 둔다. */}
        <CurriculumChips />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
