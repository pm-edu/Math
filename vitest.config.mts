import { defineConfig } from "vitest/config";
import path from "path";

// 학습 엔진(src/lib/engine)은 UI와 분리된 순수 함수라 브라우저/DOM 없이 노드 환경에서 테스트한다.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
