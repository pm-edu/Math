import type { NextConfig } from "next";

const CHROMIUM_TRACE_INCLUDE = ["./node_modules/@sparticuz/chromium/**/*"];

const nextConfig: NextConfig = {
  // puppeteer-core + @sparticuz/chromium(PDF 생성용, src/lib/pdf/generate.ts)을 Next의
  // 서버 번들링 대상에서 빼둔다 — 번들링을 거치면 @sparticuz/chromium이 런타임에 필요한
  // 압축 바이너리 파일을 못 찾아서(파일 추적이 안 됨) Vercel에서 바로 죽는다
  // (2026-09-14 실배포 중 발견 — 로컬은 시스템 Chrome을 쓰므로 이 문제가 안 보였음).
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // serverExternalPackages만으로는 부족했다(2026-09-15, sample-pdf 라우트 실배포 중 발견) —
  // 그건 번들러가 이 패키지의 JS를 건드리지 않게만 할 뿐, Vercel의 파일 트레이싱은 여전히
  // executablePath()가 런타임에 여는 압축 바이너리(bin/ 폴더)를 정적으로 못 찾아서 함수
  // 배포물에서 빠뜨린다("/var/task/node_modules/@sparticuz/chromium/bin 없음" 에러).
  // PDF를 만드는 라우트 3곳에 바이너리를 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/study/sample-pdf": CHROMIUM_TRACE_INCLUDE,
    "/api/send-mail": CHROMIUM_TRACE_INCLUDE,
    "/api/admin/worksheets/[id]/pdf": CHROMIUM_TRACE_INCLUDE,
  },
};

export default nextConfig;
