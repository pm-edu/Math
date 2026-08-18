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
  const [state, setState] = useState<"idle" | "playing" | "done" | "error">("idle");

  // play()가 실패하면(만료된 signed URL, 네트워크 등) "playing" 상태에 영원히 멈추지 않도록
  // 반드시 error 상태로 되돌려 재시도 버튼을 보여준다 — 재생 자체는 여전히 1회 제한(§6)이라
  // 실패했을 때만 재시도를 허용하는 것이지, 끝까지 들은 뒤 되돌리기가 가능해지는 건 아니다.
  function play() {
    if (state !== "idle" && state !== "error") return;
    setState("playing");
    audioRef.current?.play().catch(() => setState("error"));
  }

  function handleEnded() {
    setState("done");
    onComplete();
  }

  function handleError() {
    if (state === "playing") setState("error");
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4">
      <audio ref={audioRef} src={src} onEnded={handleEnded} onError={handleError} preload="auto" />
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
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p aria-live="polite" className="text-sm font-medium text-red-600">
            Audio failed to play.
          </p>
          <button
            type="button"
            onClick={play}
            className="flex items-center gap-2 rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
          >
            ▶ Retry
          </button>
        </div>
      )}
    </div>
  );
}
