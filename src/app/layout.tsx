import type { Metadata } from "next";
import { cookies } from "next/headers";
import { site } from "@/lib/site";
import { LanguageProvider, type Lang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 저장된 언어를 서버에서 먼저 읽어, 첫 화면부터 올바른 언어로 그린다.
  // (그래야 한국어 → 영어로 깜빡이지 않는다)
  const cookieStore = await cookies();
  const saved = cookieStore.get("lang")?.value;
  const initialLang: Lang = saved === "en" ? "en" : "ko";

  return (
    <html lang={initialLang} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
