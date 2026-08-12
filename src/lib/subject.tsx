"use client";

// 과목(수학/영어) 전환. 헤더의 [수학|영어] 탭으로 바꾸며,
// 문제은행·문제지·학생 학습지가 선택한 과목만 보이도록 필터한다.
// 언어 전환(i18n)과 같은 방식: 쿠키 + localStorage 저장.

import { createContext, useContext, useState } from "react";
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

type SubjectContextValue = {
  subject: Subject;
  setSubject: (s: Subject) => void;
};

const SubjectContext = createContext<SubjectContextValue>({
  subject: "math",
  setSubject: () => {},
});

export function SubjectProvider({
  children,
  initialSubject = "math",
}: {
  children: React.ReactNode;
  initialSubject?: Subject;
}) {
  const [subject, setSubjectState] = useState<Subject>(initialSubject);

  function setSubject(next: Subject) {
    setSubjectState(next);
    document.cookie = `subject=${next}; path=/; max-age=31536000; samesite=lax`;
    window.localStorage.setItem("subject", next);
  }

  return (
    <SubjectContext.Provider value={{ subject, setSubject }}>
      {children}
    </SubjectContext.Provider>
  );
}

export function useSubject() {
  return useContext(SubjectContext);
}
