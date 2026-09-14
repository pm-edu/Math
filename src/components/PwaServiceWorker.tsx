"use client";

import { useEffect } from "react";

// PWA 설치 가능 조건(크롬 기준 매니페스트 + fetch 핸들러 있는 서비스워커 등록)을
// 채우기 위한 등록만 담당 — public/sw.js 참고.
export function PwaServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
