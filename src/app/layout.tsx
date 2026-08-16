import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter } from "next/font/google";
import { site } from "@/lib/site";
import { LanguageProvider, type Lang } from "@/lib/i18n";
import { SubjectProvider, type Subject } from "@/lib/subject";
import "./globals.css";

// 영어 화면용 영문 폰트. CSS 변수로 노출해 lang=en 일 때만 쓴다.
const inter = Inter({ subsets: ["latin"], variable: "--font-en", display: "swap" });

// 접속 도메인(미들웨어가 세팅한 subject 쿠키)에 따라 탭 제목·설명이 달라진다.
// pmedu4u.com=수학, english.pmedu4u.com=영어.
export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const subject: Subject = cookieStore.get("subject")?.value === "english" ? "english" : "math";
  const subjectLabel = subject === "english" ? "영어" : "수학";
  return {
    title: `${site.name} | 초중고 IB ${subjectLabel} 온라인 클래스`,
    description: `동영상 강의와 학습자료를 함께 제공하는 초중고, IB ${subjectLabel} 온라인 클래스`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 저장된 언어를 서버에서 먼저 읽어, 첫 화면부터 올바른 언어로 그린다.
  // (그래야 한국어 → 영어로 깜빡이지 않는다)
  const cookieStore = await cookies();
  const saved = cookieStore.get("lang")?.value;
  const initialLang: Lang = saved === "en" ? "en" : "ko";
  const savedSubject = cookieStore.get("subject")?.value;
  const initialSubject: Subject = savedSubject === "english" ? "english" : "math";

  return (
    <html lang={initialLang} className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col">
        <LanguageProvider initialLang={initialLang}>
          <SubjectProvider initialSubject={initialSubject}>{children}</SubjectProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
