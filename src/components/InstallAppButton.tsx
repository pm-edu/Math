"use client";

import { useInstallPrompt } from "@/lib/installPrompt";

export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  if (!canInstall) return null;

  return (
    <button type="button" onClick={promptInstall} className={className}>
      앱으로 설치
    </button>
  );
}
