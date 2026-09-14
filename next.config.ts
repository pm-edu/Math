import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium(PDF 생성용, src/lib/pdf/generate.ts)을 Next의
  // 서버 번들링 대상에서 빼둔다 — 번들링을 거치면 @sparticuz/chromium이 런타임에 필요한
  // 압축 바이너리 파일을 못 찾아서(파일 추적이 안 됨) Vercel에서 바로 죽는다
  // (2026-09-14 실배포 중 발견 — 로컬은 시스템 Chrome을 쓰므로 이 문제가 안 보였음).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
