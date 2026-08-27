"use client";

import { useEffect, useState } from "react";
import AudioPlayer from "../AudioPlayer";
import RecorderPanel, { type SpeakingStageStatus } from "../RecorderPanel";
import type { ListenAndRepeatPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 listen_and_repeat: 문장을 듣고 그대로 따라 말한다. 요청(2026-08-18): 전 과정
// 자동 진행(사용자 버튼 없음) — 오디오 재생 → 3초 카운트다운 → 자동 녹음 → 응답시간(블루프린트
// response_window_sec) 종료 시 자동 정지. 재녹음 불가라서 시작 전에 명확히 고지한다.
// 3초 프리롤은 spec/payload에 정의된 값이 아니라 이 화면의 UX 여유시간일 뿐이라 상수로 둔다
// (채점에 쓰는 response_window_sec 자체는 여전히 payload에서 그대로 읽는다 — §2 하드코딩 금지
// 규칙은 배점/시간budget 얘기지, 이 준비 신호까지 데이터화하라는 뜻은 아니라고 판단함).
const PREP_SEC = 3;

type Phase = "playing_clip" | "counting_down" | "recording" | "done";

export default function ListenAndRepeat({
  item,
  attemptId,
  value,
  onChange,
  onStatusChange,
}: {
  item: ToeflItemPublic;
  attemptId: string;
  value: { audio_path?: string } | undefined;
  onChange: (answer: { audio_path: string }) => void;
  onStatusChange?: (status: SpeakingStageStatus) => void;
}) {
  const payload = item.payload as ListenAndRepeatPayload;
  const alreadyRecorded = !!value?.audio_path;
  const [phase, setPhase] = useState<Phase>(payload.clip_path ? "playing_clip" : "counting_down");
  const [countdown, setCountdown] = useState(PREP_SEC);
  const [invalidated, setInvalidatedRaw] = useState(false);
  function setInvalidated(v: boolean) {
    setInvalidatedRaw(v);
    if (v) onStatusChange?.({ phase: "failed" });
  }

  useEffect(() => {
    if (phase !== "counting_down") return;
    const t = setTimeout(() => {
      if (countdown <= 1) setPhase("recording");
      else setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // 화면 검토(2026-08-27) [A]-2: "playing_clip"(문장 재생 중)도 응답 준비 단계로 "prep"에 합친다.
  useEffect(() => {
    if (alreadyRecorded) onStatusChange?.({ phase: "done" });
    else if (phase === "playing_clip") onStatusChange?.({ phase: "prep", secondsLeft: PREP_SEC });
    else if (phase === "counting_down") onStatusChange?.({ phase: "prep", secondsLeft: countdown });
    else if (phase === "done") onStatusChange?.({ phase: "done" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown, alreadyRecorded]);

  if (alreadyRecorded) {
    return (
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
        <p className="mt-4 text-sm font-medium text-[var(--mint-dark)]">✓ Response recorded</p>
      </div>
    );
  }

  if (invalidated) {
    return (
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
        <p className="mt-4 text-sm text-red-600">⚠ This task could not be completed and was left unanswered.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>
      <p className="mt-1 text-xs text-[var(--secondary)]">
        You&apos;ll hear a sentence once, then repeat it back. This happens automatically — there&apos;s no re-recording.
      </p>

      {phase === "playing_clip" && payload.clip_path && (
        <div className="mt-4">
          <AudioPlayer autoPlay src={payload.clip_path} onComplete={() => setPhase("counting_down")} />
        </div>
      )}

      {phase === "counting_down" && (
        <p className="mt-4 text-lg font-medium text-[var(--foreground)]">Get ready… {countdown}s</p>
      )}

      {phase === "recording" && (
        <div className="mt-4">
          <RecorderPanel
            itemId={item.id}
            attemptId={attemptId}
            durationSec={payload.response_window_sec}
            onUploaded={(path) => {
              setPhase("done");
              onChange({ audio_path: path });
            }}
            onPermissionLost={() => setInvalidated(true)}
            onStatusChange={onStatusChange}
          />
        </div>
      )}

      {phase === "done" && <p className="mt-4 text-sm font-medium text-[var(--mint-dark)]">✓ Response recorded</p>}
    </div>
  );
}
