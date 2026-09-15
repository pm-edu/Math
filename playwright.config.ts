import { defineConfig } from "@playwright/test";

// 가입 흐름 E2E(tests/signup.e2e.ts) 전용 설정. 이 저장소엔 스테이징 환경이 없어서
// (scripts/lib/staging-env.ts 참고) 여기서도 같은 원칙을 지킨다 — APP_BASE_URL이 운영
// 도메인이면 테스트 자체가 실행 전에 막히도록 tests/signup.e2e.ts에서 별도로 가드한다.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
