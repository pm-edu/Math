"use client";

// 과목(수학/영어) 값을 화면에서 읽는다. 값 자체는 접속 도메인이 정한다
// (src/middleware.ts가 subject 쿠키를 세팅, src/app/layout.tsx가 서버에서 읽어 Provider 초기값으로 전달).
// 문제은행·문제지·학생 학습지가 선택한 과목만 보이도록 이 값으로 필터한다.

import { createContext, useContext } from "react";
import type { Lang } from "@/lib/i18n";

export type Subject = "math" | "english";

export const SUBJECTS: Subject[] = ["math", "english"];

const LABEL: Record<Subject, { ko: string; en: string }> = {
  math: { ko: "수학", en: "Math" },
  english: { ko: "영어", en: "English" },
};

export function subjectLabel(subject: Subject, lang: Lang): string {
  return LABEL[subject][lang];
}

/** 과목별 사이트 주소. 헤더/푸터의 "다른 과목 사이트로" 링크가 쓴다. */
export const SITE_URL: Record<Subject, string> = {
  math: "https://pmedu4u.com",
  english: "https://english.pmedu4u.com",
};

const SubjectContext = createContext<Subject>("math");

export function SubjectProvider({
  children,
  initialSubject = "math",
}: {
  children: React.ReactNode;
  initialSubject?: Subject;
}) {
  return <SubjectContext.Provider value={initialSubject}>{children}</SubjectContext.Provider>;
}

export function useSubject() {
  return { subject: useContext(SubjectContext) };
}
