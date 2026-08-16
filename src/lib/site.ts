// 사이트 브랜드 설정 (과목 무관한 값만 남아 있다).
//
// 과목별(수학/영어) 문구·배지·태그라인은 여기서 관리하지 않는다 — 이제 접속 도메인이
// 과목을 강제로 정하므로(src/middleware.ts), 그 값을 읽는 src/lib/subject.tsx(subjectLabel,
// SITE_URL)가 대신 담당한다. 예전엔 NEXT_PUBLIC_SITE_SUBJECT 환경변수로 "같은 코드,
// 다른 환경변수로 재배포"를 구상했지만 실제로 그렇게 배포한 적이 없어 삭제했다.

const name = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "PM EDU";
// 문의받을 이메일. 이 주소로 온 메일을 실제로 받으려면 수신 설정(포워딩)이 필요하다.
const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "info@pmedu4u.com";

// 메뉴 문구는 한/영 전환을 위해 글자 대신 키로 적는다.
// 실제 문구는 src/lib/i18n.tsx 의 사전에 있다.
export type NavItem = { key: "browse" | "reviews" | "contact"; href: string };

const NAV: NavItem[] = [
  { key: "browse", href: "/courses" },
  { key: "reviews", href: "/reviews" },
  { key: "contact", href: "/contact" },
];

export const site = {
  /** 헤더·푸터 메뉴 */
  nav: NAV,
  /** 사이트 이름. 헤더, 푸터, 브라우저 탭에 쓰인다. */
  name,
  /** 문의 이메일 */
  contactEmail,
} as const;
