"use client";

// 화면 문구의 한/영 전환.
// 메뉴·버튼 같은 고정 문구만 다루며, DB에 저장된 내용(강좌 제목 등)은
// 입력된 언어 그대로 표시된다.

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "ko" | "en";

const DICT = {
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
  popularCourse: { ko: "이번 주 인기 강좌", en: "Popular this week" },
} as const;

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // 첫 화면은 항상 한국어로 그려서 서버와 화면이 어긋나지 않게 하고,
  // 저장된 선택은 그 직후에 반영한다.
  const [lang, setLangState] = useState<Lang>("ko");

  useEffect(() => {
    const saved = window.localStorage.getItem("lang");
    if (saved === "en" || saved === "ko") setLangState(saved);
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
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
