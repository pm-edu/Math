// 사이트 브랜드 설정.
//
// 수학용/영어용 사이트는 같은 코드를 쓰고 환경변수만 다르게 배포한다.
// 값을 넣지 않으면 수학클래스로 동작하므로 기존 배포는 그대로 유지된다.
//
// 영어 사이트 배포 시 Vercel 환경변수 예시:
//   NEXT_PUBLIC_SITE_NAME=영어클래스
//   NEXT_PUBLIC_SITE_SUBJECT=영어
//   NEXT_PUBLIC_SITE_TAGLINE=문법부터 실전까지,\n한번에 잡는 영어
//
// 환경변수에는 줄바꿈을 직접 넣을 수 없으므로 \n 두 글자로 적는다.

const subject = process.env.NEXT_PUBLIC_SITE_SUBJECT?.trim() || "수학";
// 화면에 보이는 브랜드명. 회사 브랜드 'PM EDU'로 통일한다.
// 나중에 다른 이름을 쓰려면 NEXT_PUBLIC_SITE_NAME 으로 덮어쓴다.
const name = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "PM EDU";
const tagline = (
  process.env.NEXT_PUBLIC_SITE_TAGLINE?.trim() ||
  `개념부터 실전까지,\n한번에 잡는 ${subject}`
).replace(/\\n/g, "\n");

// 메뉴 문구는 한/영 전환을 위해 글자 대신 키로 적는다.
// 실제 문구는 src/lib/i18n.tsx 의 사전에 있다.
export type NavItem = { key: "browse" | "reviews" | "contact"; href: string };

// 사이트마다 메뉴가 다르다. 과목을 추가하면 여기에 목록을 하나 더 만든다.
const NAV: Record<string, NavItem[]> = {
  수학: [
    { key: "browse", href: "/courses" },
    { key: "reviews", href: "/reviews" },
    { key: "contact", href: "/contact" },
  ],
  영어: [
    { key: "browse", href: "/courses" },
    { key: "reviews", href: "/reviews" },
    { key: "contact", href: "/contact" },
  ],
};

// 영어 화면용 과목 이름
const SUBJECT_EN: Record<string, string> = { 수학: "Math", 영어: "English" };

/** 다른 과목 사이트로 보내는 링크. 주소를 넣으면 헤더에 나타난다. */
const partner =
  process.env.NEXT_PUBLIC_PARTNER_SITE_URL?.trim() && process.env.NEXT_PUBLIC_PARTNER_SITE_LABEL?.trim()
    ? {
        url: process.env.NEXT_PUBLIC_PARTNER_SITE_URL.trim(),
        label: process.env.NEXT_PUBLIC_PARTNER_SITE_LABEL.trim(),
      }
    : null;

export const site = {
  /** 이 사이트가 영어 사이트인지. 과목 전용 기능을 가릴 때 쓴다. */
  isEnglish: subject === "영어",
  /** 헤더·푸터 메뉴 */
  nav: NAV[subject] ?? NAV["수학"],
  /** 다른 과목 사이트 링크 (없으면 null) */
  partner,
  /** 사이트 이름. 헤더, 푸터, 브라우저 탭에 쓰인다. */
  name,
  /** 과목 이름. 문구 안에 끼워 넣는 용도. */
  subject,
  /** 히어로 제목. 줄바꿈은 \n 으로 구분한다. */
  tagline,
  /** 브라우저 탭과 검색 결과에 쓰이는 제목 */
  title: `${name} | 초중고 IB ${subject} 온라인 클래스`,
  /** 검색 결과에 쓰이는 설명 */
  description: `동영상 강의와 학습자료를 함께 제공하는 초중고, IB ${subject} 온라인 클래스`,
  /** 헤더 배지와 푸터에 쓰이는 짧은 소개 */
  blurb: `초 · 중 · 고 · IB ${subject} 온라인 클래스`,
  /** 히어로 상단 배지 */
  badge: `초 · 중 · 고 · IB ${subject} 전문`,

  // ----- 영어 화면용 문구 -----
  subjectEn: SUBJECT_EN[subject] ?? subject,
  taglineEn: (
    process.env.NEXT_PUBLIC_SITE_TAGLINE_EN?.trim() ||
    `From concepts to real exams,\nmaster ${SUBJECT_EN[subject] ?? subject} in one place`
  ).replace(/\\n/g, "\n"),
  blurbEn: `Online ${SUBJECT_EN[subject] ?? subject} classes · Elementary to IB`,
  badgeEn: `Elementary · Middle · High · IB ${SUBJECT_EN[subject] ?? subject}`,
  heroSubEn: `Video lessons and study materials in one online ${SUBJECT_EN[subject] ?? subject} class.\nStart with a curriculum built for your grade and course.`,
} as const;
