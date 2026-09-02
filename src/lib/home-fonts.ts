import localFont from "next/font/local";

// 홈페이지 리디자인(2026-09-02, [[toefl-subsystem-plan]] 참고) 전용 폰트 로더.
// 프로젝트 전역 Pretendard 로딩(globals.css의 @import "pretendard/dist/web/static/pretendard.css")은
// 그대로 두고 안 건드린다 — 다른 화면에 영향 없게, 이 홈 섹션에서만 쓰는 별도 로더를 둔다.
// 지시서 요구사항: CDN <link> 금지, next/font/local로 서브셋(여기선 variable 파일 하나)을 로드.
//
// 숫자·영문 라벨용 Space Grotesk는 새로 안 만든다 — src/app/layout.tsx가 이미
// `--font-en-num`으로 전역 로드해뒀다(TOEFL .en-num이 쓰던 것). 홈 컴포넌트들도
// var(--font-en-num)을 그대로 참조한다(중복 로드 방지).
export const pretendardHome = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard-home",
  weight: "45 920", // Pretendard variable 폰트의 실제 굵기 축 범위 — 450(본문)·800(제목) 둘 다 이 범위 안.
  display: "swap",
});
