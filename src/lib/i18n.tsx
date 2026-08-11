"use client";

// 화면 문구의 한/영 전환.
// 메뉴·버튼 같은 고정 문구만 다루며, DB에 저장된 내용(강좌 제목 등)은
// 입력된 언어 그대로 표시된다.

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "ko" | "en";

const DICT = {
  // 헤더 · 푸터
  browse: { ko: "강좌 둘러보기", en: "Courses" },
  reviews: { ko: "후기", en: "Reviews" },
  contact: { ko: "문의", en: "Contact" },
  admin: { ko: "관리", en: "Admin" },
  mypage: { ko: "마이페이지", en: "My Page" },
  login: { ko: "로그인", en: "Log in" },
  viewCourses: { ko: "강좌 보기", en: "Browse" },
  quickLinks: { ko: "바로가기", en: "Links" },
  contactTitle: { ko: "문의", en: "Contact" },
  freeSample: { ko: "무료 샘플 보기", en: "Free Samples" },
  popularCourse: { ko: "새로 열린 강좌", en: "New course" },

  // 강좌 목록 · 상세
  coursesTitle: { ko: "강좌 · 자료", en: "Courses & Materials" },
  coursesSubtitle: {
    ko: "초 · 중 · 고 · IB 과정별 동영상 강의와 학습자료 패키지",
    en: "Video lessons and study materials from Elementary to IB",
  },
  includes: { ko: "구성", en: "What's included" },
  addToCart: { ko: "장바구니에 담기", en: "Add to cart" },
  enterClassroom: { ko: "강의실 들어가기", en: "Enter classroom" },

  // 수강신청
  enroll: { ko: "수강 신청하기", en: "Enroll" },
  enrolling: { ko: "신청 중...", en: "Enrolling..." },
  loginToEnroll: { ko: "로그인하고 신청하기", en: "Log in to enroll" },
  enrollPending: { ko: "입금 확인 중", en: "Awaiting payment" },
  enrolled: { ko: "수강 중", en: "Enrolled" },
  enrollDoneTitle: { ko: "수강 신청이 접수되었습니다", en: "Enrollment requested" },
  enrollDoneSub: {
    ko: "아래 계좌로 입금해 주시면, 확인 후 강의가 열립니다.",
    en: "Transfer to the account below. Your lessons open after we confirm payment.",
  },
  bankInfoTitle: { ko: "입금 계좌", en: "Payment details" },
  bankInfoPreparing: {
    ko: "입금 안내는 곧 등록됩니다. 문의로 연락 주세요.",
    en: "Payment details coming soon. Please reach us via Contact.",
  },
  alreadyPending: {
    ko: "이미 신청하셨습니다. 입금 확인을 기다리고 있습니다.",
    en: "Already requested. Awaiting payment confirmation.",
  },
  alreadyEnrolled: { ko: "이미 수강 중인 강좌입니다.", en: "You're already enrolled." },
  enrollFailed: {
    ko: "신청에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Request failed. Please try again shortly.",
  },

  // 무료 샘플 · 강의실 · 재생
  sampleTitle: { ko: "무료 샘플 강의", en: "Free Sample Lessons" },
  sampleSubtitle: {
    ko: "결제 없이 미리 보실 수 있는 강의입니다.",
    en: "Preview these lessons without payment.",
  },
  samplePreparing: { ko: "준비 중입니다.", en: "Coming soon." },
  samplePreparingSub: {
    ko: "무료 샘플 강의를 준비하고 있습니다. 먼저 강좌 구성을 살펴보세요.",
    en: "Free samples are on the way. Browse the courses in the meantime.",
  },
  freeBadge: { ko: "무료 샘플", en: "Free sample" },
  watchVideo: { ko: "영상 보러 가기", en: "Watch video" },
  noVideo: { ko: "아직 영상이 등록되지 않았습니다.", en: "No video yet." },
  closeVideo: { ko: "영상 닫기", en: "Close video" },
  downloadMaterial: { ko: "학습자료 내려받기", en: "Download materials" },
  backToCourse: { ko: "← 강좌 소개로", en: "← Back to course" },
  classroom: { ko: "강의실", en: "Classroom" },
  loading: { ko: "불러오는 중...", en: "Loading..." },
  noLessons: { ko: "아직 볼 수 있는 강의가 없습니다.", en: "No lessons available yet." },
  noLessonsLoggedIn: {
    ko: "이 강좌를 수강 신청하시면 전체 강의가 열립니다.",
    en: "Enroll in this course to unlock all lessons.",
  },
  noLessonsLoggedOut: {
    ko: "로그인 후 수강 중인 강좌의 강의를 보실 수 있습니다.",
    en: "Log in to watch lessons from your enrolled courses.",
  },
  exploreCourse: { ko: "강좌 살펴보기", en: "View course" },

  // 로그인 · 회원가입
  email: { ko: "이메일", en: "Email" },
  password: { ko: "비밀번호", en: "Password" },
  name: { ko: "이름", en: "Name" },
  signup: { ko: "회원가입", en: "Sign up" },
  forgotPassword: { ko: "비밀번호를 잊으셨나요?", en: "Forgot your password?" },
  noAccount: { ko: "계정이 없으신가요?", en: "Don't have an account?" },
  haveAccount: { ko: "이미 계정이 있으신가요?", en: "Already have an account?" },
  loggingIn: { ko: "로그인 중...", en: "Logging in..." },
  signingUp: { ko: "가입 중...", en: "Signing up..." },
  pwPlaceholder: { ko: "6자 이상 입력해주세요", en: "At least 6 characters" },
  signupDone: { ko: "가입 확인 이메일을 보냈어요", en: "Check your inbox" },
  signupDoneSub: {
    ko: "메일함에서 인증 링크를 확인한 뒤 로그인해주세요.",
    en: "Click the verification link in your email, then log in.",
  },
  goLogin: { ko: "로그인하러 가기", en: "Go to login" },

  // 후기
  reviewsTitle: { ko: "수강 후기", en: "Student Reviews" },
  reviewsSubtitle: {
    ko: "실제 수강생과 학부모님들이 남겨주신 후기입니다.",
    en: "Reviews from real students and parents.",
  },
  noReviews: { ko: "아직 등록된 후기가 없습니다.", en: "No reviews yet." },
  noReviewsSub: { ko: "첫 수강 후기를 기다리고 있습니다.", en: "Be the first to leave one." },
  student: { ko: "수강생", en: "Student" },

  // 문의
  contactPageTitle: { ko: "문의하기", en: "Contact Us" },
  contactSubtitle: {
    ko: "궁금하신 점을 남겨주시면 빠르게 답변드리겠습니다.",
    en: "Leave a message and we'll get back to you quickly.",
  },
  message: { ko: "문의 내용", en: "Message" },
  send: { ko: "문의 보내기", en: "Send" },
  sending: { ko: "보내는 중...", en: "Sending..." },
  contactDone: { ko: "문의가 접수되었습니다", en: "Your message has been received" },
  contactDoneSub: { ko: "남겨주신 이메일로 답변드리겠습니다.", en: "We'll reply to your email." },
  whatsapp: { ko: "왓츠앱으로 상담하기", en: "Chat on WhatsApp" },

  // 마이페이지
  myInfo: { ko: "내 정보", en: "My Info" },
  logout: { ko: "로그아웃", en: "Log out" },
  myCourses: { ko: "내 강좌", en: "My Courses" },
  noCourses: {
    ko: "아직 수강 중인 강좌가 없습니다.",
    en: "You're not enrolled in any courses yet.",
  },
  goWatch: { ko: "보러 가기", en: "Watch" },
  adminPanel: { ko: "학생 관리 화면으로", en: "Go to admin panel" },
  myWorksheets: { ko: "내 학습지", en: "My Worksheets" },

  // 계정
  withdraw: { ko: "회원 탈퇴", en: "Delete account" },
  withdrawConfirm: {
    ko: "정말 탈퇴하시겠어요? 계정과 학습 기록이 모두 삭제되며 되돌릴 수 없습니다.",
    en: "Delete your account? Your data and records will be permanently removed.",
  },
  withdrawDone: { ko: "탈퇴가 완료되었습니다.", en: "Your account has been deleted." },
  withdrawFailed: {
    ko: "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.",
    en: "Failed to delete account. Please try again shortly.",
  },
  dangerZone: { ko: "계정 관리", en: "Account" },
} as const;

// 강좌 분류는 값이 4개로 정해져 있어서 화면에서 번역할 수 있다.
const CATEGORY_EN: Record<string, string> = {
  초등: "Elementary",
  중등: "Middle School",
  고등: "High School",
  IB: "IB",
};

export function categoryLabel(category: string, lang: Lang): string {
  return lang === "en" ? CATEGORY_EN[category] ?? category : category;
}

export type DictKey = keyof typeof DICT;

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
};

const LangContext = createContext<LangContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key) => DICT[key].ko,
});

export function LanguageProvider({
  children,
  initialLang = "ko",
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  // 서버가 쿠키로 판단한 언어를 그대로 첫 값으로 받는다.
  // 서버 렌더와 클라이언트 첫 렌더가 같은 언어라 깜빡임이 없다.
  const [lang, setLangState] = useState<Lang>(initialLang);

  function setLang(next: Lang) {
    setLangState(next);
    // <html lang> 을 즉시 바꿔 영문/한글 폰트 전환이 바로 반영되게 한다.
    document.documentElement.lang = next;
    // 쿠키(서버가 읽음) + localStorage(안전망) 둘 다 저장
    document.cookie = `lang=${next}; path=/; max-age=31536000; samesite=lax`;
    window.localStorage.setItem("lang", next);
  }

  const t = (key: DictKey) => DICT[key][lang];

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
