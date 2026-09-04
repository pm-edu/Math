// SAT(디지털 SAT) 학생용 랜딩 — 지금은 라우팅 인프라만 확인하는 뼈대다.
// 실제 랜딩 화면(히어로·연습 카드·모의고사 시작 등)은 다음 단계(화면 뼈대)에서 만든다.
// TOEFL의 src/app/toefl/page.tsx와 같은 역할이 될 자리.

import SatHeader from "@/components/sat/SatHeader";

export default function SatLandingPage() {
  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <SatHeader />
      <main className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">SAT — 준비 중</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">
          디지털 SAT 서브시스템 라우팅이 연결됐습니다. 학생용 화면은 다음 단계에서 채워집니다.
        </p>
      </main>
    </div>
  );
}
