"use client";

import { useEffect, useState } from "react";
import AudioPlayer from "../AudioPlayer";
import RecorderPanel, { type SpeakingStageStatus } from "../RecorderPanel";
import type { TakeAnInterviewPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 take_an_interview: 질문은 텍스트로 보여주지 않는다(음성 only, 아바타 아이콘만).
// 요청(2026-08-18): 준비시간(payload.prep_sec) 종료 시 자동 녹음 시작, 응답시간(response_sec)
// 종료 시 자동 정지 — 전 과정 자동, 이전 턴 답변은 재생·수정 불가.
// 3턴 표시(turnIndex/turnTotal)는 이 컴포넌트가 스스로 알 수 없다(문항 하나만 받으므로) —
// 부모(TaskRenderer→speaking/page.tsx)가 같은 섹션의 take_an_interview 문항들 중 몇 번째인지
// 계산해서 내려준다.

type Phase = "question" | "prep" | "recording" | "done";

export default function TakeAnInterview({
  item,
  attemptId,
  value,
  onChange,
  turnIndex,
  turnTotal,
  onStatusChange,
}: {
  item: ToeflItemPublic;
  attemptId: string;
  value: { audio_path?: string } | undefined;
  onChange: (answer: { audio_path: string }) => void;
  turnIndex?: number; // 0-based
  turnTotal?: number;
  onStatusChange?: (status: SpeakingStageStatus) => void;
}) {
  const payload = item.payload as TakeAnInterviewPayload;
  const alreadyRecorded = !!value?.audio_path;
  const [phase, setPhase] = useState<Phase>("question");
  const [countdown, setCountdown] = useState(payload.prep_sec);
  const [invalidated, setInvalidatedRaw] = useState(false);
  function setInvalidated(v: boolean) {
    setInvalidatedRaw(v);
    if (v) onStatusChange?.({ phase: "failed" });
  }

  // 질문 오디오 자산이 없는 데모 데이터 갭 대비 — 사용자 버튼 없이 자동으로 다음 단계로 넘어간다.
  useEffect(() => {
    if (phase !== "question" || payload.question_audio_path) return;
    const t = setTimeout(() => setPhase("prep"), 1500);
    return () => clearTimeout(t);
  }, [phase, payload.question_audio_path]);

  useEffect(() => {
    if (phase !== "prep") return;
    const t = setTimeout(() => {
      if (countdown <= 1) setPhase("recording");
      else setCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // 화면 검토(2026-08-27) [A]-2: "question"(질문 음성 듣는 중)도 응답을 준비하는 단계라 "prep"로
  // 합쳐 보고한다 — 페이지 상단 상태표시는 5단계(준비/녹음/업로드/완료/실패)만 구분하면 된다.
  useEffect(() => {
    if (alreadyRecorded) onStatusChange?.({ phase: "done" });
    else if (phase === "question") onStatusChange?.({ phase: "prep", secondsLeft: payload.prep_sec });
    else if (phase === "prep") onStatusChange?.({ phase: "prep", secondsLeft: countdown });
    else if (phase === "done") onStatusChange?.({ phase: "done" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, countdown, alreadyRecorded]);

  const turnLabel = turnTotal && turnTotal > 1 ? `Turn ${(turnIndex ?? 0) + 1} of ${turnTotal}` : null;

  if (alreadyRecorded) {
    return (
      <div>
        {turnLabel && <p className="mb-2 text-xs font-semibold text-[var(--secondary)]">{turnLabel}</p>}
        <p className="text-sm font-medium text-[var(--mint-dark)]">✓ Response recorded</p>
        <p className="mt-1 text-xs text-[var(--secondary)]">Previous answers can&apos;t be replayed or changed.</p>
      </div>
    );
  }

  if (invalidated) {
    return (
      <div>
        {turnLabel && <p className="mb-2 text-xs font-semibold text-[var(--secondary)]">{turnLabel}</p>}
        <p className="text-sm text-red-600">⚠ This turn could not be completed and was left unanswered.</p>
      </div>
    );
  }

  return (
    <div>
      {turnLabel && <p className="mb-2 text-xs font-semibold text-[var(--secondary)]">{turnLabel}</p>}
      <p className="text-xs text-[var(--secondary)]">
        Listen to the question carefully — it is spoken only and will not be shown as text.
      </p>

      {phase === "question" && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-c)] py-8 text-center">
          <span className="text-4xl" aria-hidden="true">
            🎙️
          </span>
          {payload.question_audio_path ? (
            <AudioPlayer autoPlay src={payload.question_audio_path} onComplete={() => setPhase("prep")} />
          ) : (
            <span className="text-xs text-[var(--secondary)]">Question audio unavailable — continuing…</span>
          )}
        </div>
      )}

      {phase === "prep" && (
        <p className="mt-4 text-lg font-medium text-[var(--foreground)]">Get ready… {countdown}s</p>
      )}

      {phase === "recording" && (
        <div className="mt-4">
          <RecorderPanel
            itemId={item.id}
            attemptId={attemptId}
            durationSec={payload.response_sec}
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
