"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAudioRecorder } from "./useAudioRecorder";
import AudioPlayer from "./AudioPlayer";
import type { TakeAnInterviewPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 take_an_interview: 질문은 텍스트로 보여주지 않는다(음성 only) — 준비시간 끝나면
// 자동으로 녹음이 시작되고, 응답시간이 끝나면 자동으로 멈춘다. 채점(3지표 AI 루브릭)은
// finish 시점에 서버에서 한다.

type Phase = "question" | "prep" | "recording" | "done";

export default function TakeAnInterviewRenderer({
  item,
  attemptId,
  value,
  onChange,
}: {
  item: ToeflItemPublic;
  attemptId: string;
  value: { audio_path?: string } | undefined;
  onChange: (answer: { audio_path: string }) => void;
}) {
  const payload = item.payload as TakeAnInterviewPayload;
  const [phase, setPhase] = useState<Phase>("question");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const recorder = useAudioRecorder();
  const startedRecordingRef = useRef(false);

  async function handleStop() {
    const blob = await recorder.stop();
    setPhase("done");
    if (!blob) return;
    setUploading(true);
    setUploadError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setUploadError("Not logged in.");
      setUploading(false);
      return;
    }
    const path = `${auth.user.id}/${attemptId}/${item.id}.webm`;
    const { error } = await supabase.storage
      .from("toefl-recordings")
      .upload(path, blob, { contentType: "audio/webm", upsert: true });
    setUploading(false);
    if (error) {
      setUploadError(`Upload failed: ${error.message}`);
      return;
    }
    onChange({ audio_path: path });
  }

  function handleQuestionDone() {
    setPhase("prep");
    setRemaining(payload.prep_sec);
  }

  // 준비시간·응답시간 카운트다운. 준비시간이 끝나면 자동 녹음 시작, 응답시간이 끝나면 자동 중단.
  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;
    if (remaining === null) return;

    if (remaining <= 0) {
      if (phase === "prep") {
        setPhase("recording");
        setRemaining(payload.response_sec);
        if (!startedRecordingRef.current) {
          startedRecordingRef.current = true;
          recorder.start();
        }
      } else {
        handleStop();
      }
      return;
    }

    const t = setTimeout(() => setRemaining((r) => (r ?? 1) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, remaining]);

  return (
    <div>
      <p className="text-xs text-[var(--secondary)]">
        Listen to the question carefully — it is spoken only and will not be shown as text.
      </p>

      {phase === "question" &&
        (payload.question_audio_path ? (
          <AudioPlayer src={payload.question_audio_path} onComplete={handleQuestionDone} />
        ) : (
          <button
            type="button"
            onClick={handleQuestionDone}
            className="mt-3 rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
          >
            Question audio unavailable — continue
          </button>
        ))}

      {phase === "prep" && (
        <p className="mt-4 text-lg font-medium text-[var(--foreground)]">Get ready… {remaining}s</p>
      )}

      {phase === "recording" && (
        <p className="mt-4 text-lg font-medium text-red-600">● Recording… {remaining}s left</p>
      )}

      {phase === "done" && (
        <div className="mt-4">
          {uploading && <p className="text-sm text-[var(--secondary)]">Uploading...</p>}
          {value?.audio_path && !uploading && (
            <p className="text-sm text-[var(--mint-dark)]">✓ Response recorded</p>
          )}
        </div>
      )}

      {recorder.error && <p className="mt-2 text-xs text-red-600">{recorder.error}</p>}
      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
    </div>
  );
}
