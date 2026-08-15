"use client";

import { useRef, useState } from "react";

// Listening 재생 규칙(spec §6, §10): 재생은 1회, 되감기/일시정지로 다시 듣기 불가.
// 그래서 브라우저 기본 <audio controls>(스크러버로 되감기 가능) 대신 재생 버튼 하나만 노출하고,
// 끝까지 재생되면(onEnded) 버튼을 없애 재생 불가 상태로 만든다.

export default function AudioPlayer({
  src,
  onComplete,
}: {
  src: string;
  onComplete: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "done">("idle");

  function play() {
    if (state !== "idle") return;
    setState("playing");
    audioRef.current?.play();
  }

  function handleEnded() {
    setState("done");
    onComplete();
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4">
      <audio ref={audioRef} src={src} onEnded={handleEnded} preload="auto" />
      {state === "idle" && (
        <button
          type="button"
          onClick={play}
          className="flex items-center gap-2 rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
        >
          ▶ Play audio
        </button>
      )}
      {state === "playing" && (
        <p aria-live="polite" className="text-sm font-medium text-[var(--foreground)]">
          ▶ Playing… listen carefully, it only plays once.
        </p>
      )}
      {state === "done" && (
        <p aria-live="polite" className="text-sm font-medium text-[var(--mint-dark)]">
          ✓ Audio finished
        </p>
      )}
    </div>
  );
}
