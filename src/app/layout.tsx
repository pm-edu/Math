import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "수학클래스 | 초중고 IB 수학 온라인 클래스",
  description: "동영상 강의와 학습자료를 함께 제공하는 초중고, IB 수학 온라인 클래스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
