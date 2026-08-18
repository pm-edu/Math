"use client";

import { useRef, useState } from "react";

// Listening 재생 규칙(spec §6, §10): 재생은 1회, 되감기/일시정지로 다시 듣기 불가.
// 그래서 브라우저 기본 <audio controls>(스크러버로 되감기 가능) 대신 재생 버튼 하나만 노출하고,
// 끝까지 재생되면(onEnded) 버튼을 없애 재생 불가 상태로 만든다. 진행바는 보여주되(§14 접근성 —
// "지금 어디쯤인지" 정보 자체는 숨길 이유가 없다) 클릭으로 위치를 옮길 수 있는 요소가 아니라
// 순수 표시용 <div> 막대라서 시킹이 애초에 불가능하다(마우스 이벤트를 안 받음).

const MAX_RETRIES = 3;

export type AudioPlayerState = "idle" | "playing" | "ended";

export default function AudioPlayer({
  src,
  onComplete,
  onStateChange,
  onSkip,
}: {
  src: string;
  onComplete: () => void;
  // idle/playing/ended 세 상태만 상위로 보고한다(요청 그대로) — 실패/재시도 중인 동안은
  // 응시자 입장에서 여전히 "재생 시작 전"이라 idle로 취급한다.
  onStateChange?: (state: AudioPlayerState) => void;
  // 3회 재시도 실패 후 "이 문항 건너뛰기"를 누르면 호출된다. 상위가 별도로 안 넘기면
  // onComplete()만 호출해 화면이 멈추지 않게 한다(문항은 못 들었으니 미응답으로 남을 뿐).
  onSkip?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);

  function report(next: AudioPlayerState) {
    onStateChange?.(next);
  }

  // play()가 실패하면(만료된 signed URL, 네트워크 등) "playing" 상태에 영원히 멈추지 않도록
  // 반드시 error 상태로 되돌려 재시도 버튼을 보여준다 — 재생 자체는 여전히 1회 제한(§6)이라
  // 실패했을 때만 재시도를 허용하는 것이지, 끝까지 들은 뒤 되돌리기가 가능해지는 건 아니다.
  function play() {
    if (state !== "idle" && state !== "error") return;
    setState("playing");
    report("playing");
    audioRef.current?.play().catch(() => handleError());
  }

  function handleEnded() {
    setState("done");
    setProgress(100);
    report("ended");
    onComplete();
  }

  function handleTimeUpdate() {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setProgress(Math.min(100, (el.currentTime / el.duration) * 100));
  }

  // 구조화 로그를 남길 별도 백엔드가 아직 없어서(§14가 요구하는 "업로드 실패 로그"는
  // Speaking 녹음 쪽 얘기고, 오디오 재생 실패 로그는 스펙에 저장 위치가 정의돼 있지 않음),
  // 지금은 콘솔에 구조화된 형태로 남긴다 — 나중에 실제 로그 수집처가 생기면 이 한 곳만 바꾸면 됨.
  function handleError() {
    setRetryCount((n) => {
      const next = n + 1;
      console.error("[toefl-audio-failure]", { src, attempt: next, at: new Date().toISOString() });
      return next;
    });
    setState("error");
    report("idle");
  }

  function skip() {
    onSkip?.();
    setState("done");
    report("ended");
    onComplete();
  }

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4">
      <audio
        ref={audioRef}
        src={src}
        onEnded={handleEnded}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
        preload="auto"
      />
      <div className="flex items-center gap-3">
        {state === "idle" && (
          <button
            type="button"
            onClick={play}
            className="flex items-center gap-2 rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
          >
            ▶ {retryCount > 0 ? "Play test sound" : "Play audio"}
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
          <div className="flex flex-wrap items-center gap-3">
            <p aria-live="polite" className="text-sm font-medium text-red-600">
              Audio failed to play{retryCount >= MAX_RETRIES ? ` (${retryCount} attempts)` : ""}.
            </p>
            <button
              type="button"
              onClick={play}
              className="flex items-center gap-2 rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
            >
              ▶ Retry
            </button>
            {retryCount >= MAX_RETRIES && (
              <button type="button" onClick={skip} className="text-sm font-medium text-[var(--secondary)] underline">
                Skip this question →
              </button>
            )}
          </div>
        )}
      </div>

      {/* 순수 표시용 진행바 — 클릭/드래그 이벤트를 안 받으므로 시킹이 불가능하다. */}
      {(state === "playing" || state === "done") && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--background)]" aria-hidden="true">
          <div className="h-full bg-[var(--pink)] transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
