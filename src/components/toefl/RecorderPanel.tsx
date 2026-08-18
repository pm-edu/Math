"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRecorder } from "./useRecorder";
import { recordingUploadQueue, useUploadTask } from "@/lib/toefl/recording-upload-queue";

// 공용 녹음+업로드 위젯. Speaking 두 유형(ListenAndRepeat/TakeAnInterview) 전용 — 둘 다
// "자동 진행, 사용자 버튼 없음, 재녹음 불가"라서 이 컴포넌트는 시작/정지 버튼을 아예 안 두고
// 마운트되는 순간 바로 녹음을 시작한다(부모가 "지금이 녹음할 때"를 판단해서 이 컴포넌트를
// 그 타이밍에만 그려 넣는 방식 — 프리롤 카운트다운·질문 오디오 재생은 부모 책임).
//
// 녹음 종료 즉시 recordingUploadQueue에 올려 업로드를 시작한다(요청: "녹음 종료 즉시 업로드").
// 업로드 실패는 큐가 백그라운드에서 최대 5회 지수백오프로 재시도하고, 문항을 넘어가도 계속된다.

export default function RecorderPanel({
  itemId,
  attemptId,
  durationSec,
  onUploaded,
  onPermissionLost,
}: {
  itemId: string;
  attemptId: string;
  durationSec: number;
  onUploaded: (path: string) => void;
  onPermissionLost?: () => void;
}) {
  const recorder = useRecorder();
  const [remaining, setRemaining] = useState(durationSec);
  const [permissionLostAcked, setPermissionLostAcked] = useState(false);
  const stoppedRef = useRef(false);
  const uploadTask = useUploadTask(itemId);

  async function handleStop() {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    const blob = await recorder.stop();
    if (!blob) return;
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const path = `${auth.user.id}/${attemptId}/${itemId}.${recorder.ext}`;
    recordingUploadQueue.enqueue(itemId, path, blob, recorder.mimeType || "audio/webm", onUploaded);
  }

  // 마운트되는 순간 바로 녹음 시작(부모가 타이밍을 이미 판단해서 이 컴포넌트를 그때만 그림).
  // 언마운트 시(예: 녹음 중 문항 이동 버튼을 눌러 다른 문항으로 넘어감) 반드시 recorder.stop()을
  // 불러 마이크 스트림을 놓아준다 — 안 그러면 마이크가 계속 켜진 채로 남는다. 이 중간 녹음은
  // 업로드하지 않고 버린다(재녹음 불가 원칙상 "다 채우지 못한 답"을 답으로 제출하는 게 더 이상함).
  useEffect(() => {
    recorder.start();
    return () => {
      stoppedRef.current = true;
      recorder.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 응답 시간 카운트다운 — 0이 되면 자동 정지.
  useEffect(() => {
    if (recorder.state !== "recording") return;
    const t = setTimeout(() => {
      if (remaining <= 1) handleStop();
      else setRemaining((r) => r - 1);
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state, remaining]);

  if (recorder.state === "error" && recorder.error) {
    return (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4">
        <p className="text-sm font-medium text-red-700">⚠ {recorder.error}</p>
        <p className="mt-1 text-xs text-red-600">
          This response could not be completed and will be left unanswered. Please check your browser&apos;s microphone
          permission before the next recording.
        </p>
        {!permissionLostAcked && (
          <button
            type="button"
            onClick={() => {
              setPermissionLostAcked(true);
              onPermissionLost?.();
            }}
            className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white"
          >
            OK
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-c)] bg-white px-5 py-4">
      <div className="flex items-center justify-between">
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-red-600">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          {recorder.state === "recording" ? `Recording… ${remaining}s left` : "Finishing recording…"}
        </p>
        <p className="text-xs text-[var(--secondary)]">No re-recording — this is your one take.</p>
      </div>

      {/* 실시간 입력 레벨 미터 */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]" aria-hidden="true">
        <div className="h-full bg-red-500 transition-[width] duration-100" style={{ width: `${recorder.level}%` }} />
      </div>
      {recorder.isSilent && (
        <p className="mt-1.5 text-xs font-medium text-amber-700">🔇 We&apos;re not picking up any sound — check your microphone.</p>
      )}

      {uploadTask?.status === "uploading" && (
        <p className="mt-3 text-xs text-[var(--secondary)]">Uploading your recording…</p>
      )}
      {uploadTask?.status === "pending_retry" && (
        <p className="mt-3 text-xs text-amber-700">Upload failed, retrying in the background (attempt {uploadTask.attempts}/5)…</p>
      )}
      {uploadTask?.status === "failed" && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-xs text-red-600">Upload failed after 5 attempts.</p>
          <button
            type="button"
            onClick={() => recordingUploadQueue.retryNow(itemId)}
            className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-700"
          >
            Retry now
          </button>
        </div>
      )}
      {uploadTask?.status === "done" && <p className="mt-3 text-xs font-medium text-[var(--mint-dark)]">✓ Recorded and saved</p>}
    </div>
  );
}
