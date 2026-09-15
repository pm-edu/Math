"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// 브라우저가 PWA 설치 조건을 만족하면 기본적으로 주소창 아이콘·미니 배너를 "자동으로"
// 띄워준다 — 2026-09-15, "자동으로 하지 말고 옵션을 주자"는 요청으로 그 기본 동작을
// 끄고(preventDefault) 우리가 만든 버튼(InstallAppButton)을 눌렀을 때만 설치 창이
// 뜨도록 한다. beforeinstallprompt는 세션당 한 번만 오므로, 어느 페이지에서 먼저
// 열리든 놓치지 않게 루트 레이아웃에서 이 컨텍스트로 항상 감시해둔다.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallPromptContext = createContext<{ canInstall: boolean; promptInstall: () => void }>({
  canInstall: false,
  promptInstall: () => {},
});

export function InstallPromptProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <InstallPromptContext.Provider value={{ canInstall: !!deferredPrompt, promptInstall }}>
      {children}
    </InstallPromptContext.Provider>
  );
}

export function useInstallPrompt() {
  return useContext(InstallPromptContext);
}
