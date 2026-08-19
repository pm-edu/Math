import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, Space_Grotesk } from "next/font/google";
import { site } from "@/lib/site";
import { LanguageProvider, type Lang } from "@/lib/i18n";
import { SubjectProvider } from "@/lib/subject";
import { getSubject } from "@/lib/subject-server";
import "./globals.css";

// 영어 화면용 영문 폰트. CSS 변수로 노출해 lang=en 일 때만 쓴다.
const inter = Inter({ subsets: ["latin"], variable: "--font-en", display: "swap" });

// TOEFL 랜딩의 숫자·라벨 전용 폰트(docs/toefl-main.html의 .en-num, Space Grotesk).
// next/font로 셀프호스팅하므로 새 패키지 설치나 외부 CDN 요청이 없다.
// 변수만 노출하고 실제 사용은 [data-theme="en"] 안의 .en-num 뿐이라 수학 화면에는 영향이 없다.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-en-num", display: "swap" });

// 접속 도메인(미들웨어가 세팅한 subject 쿠키)에 따라 탭 제목·설명이 달라진다.
// pmedu4u.com=수학, english.pmedu4u.com=영어, toefl.pmedu4u.com=독립 사이트처럼 별도 문구.
export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const hostname = headerList.get("host") ?? "";
  if (hostname.startsWith("toefl.")) {
    return {
      title: "TOEFL Practice | PM EDU",
      description: "Reading, Listening, Speaking, Writing practice and full-length mock tests for the 2026 TOEFL format.",
    };
  }

  const subject = await getSubject();
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
  const initialSubject = await getSubject();

  return (
    <html lang={initialLang} className={`h-full antialiased ${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-full flex flex-col">
        <LanguageProvider initialLang={initialLang}>
          <SubjectProvider initialSubject={initialSubject}>{children}</SubjectProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
