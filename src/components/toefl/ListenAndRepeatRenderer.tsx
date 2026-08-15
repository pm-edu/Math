"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAudioRecorder } from "./useAudioRecorder";
import AudioPlayer from "./AudioPlayer";
import type { ListenAndRepeatPayload, ToeflItemPublic } from "@/lib/toefl/types";

// spec §6 listen_and_repeat: 문장을 듣고 그대로 따라 말한다. 녹음은 응답창(response_window_sec)
// 만큼만 허용하고 자동으로 멈춘다. 채점(STT+정확도)은 finish 시점에 서버에서 한다 —
// 여기서는 녹음·업로드만 담당한다.

export default function ListenAndRepeatRenderer({
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
  const payload = item.payload as ListenAndRepeatPayload;
  const [hasPlayed, setHasPlayed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const recorder = useAudioRecorder();
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  async function handleStop() {
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    const blob = await recorder.stop();
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

  async function handleStart() {
    await recorder.start();
    autoStopRef.current = setTimeout(handleStop, payload.response_window_sec * 1000);
  }

  return (
    <div>
      <p className="text-sm font-medium text-[var(--foreground)]">{item.prompt}</p>

      {payload.clip_path && !hasPlayed && (
        <AudioPlayer src={payload.clip_path} onComplete={() => setHasPlayed(true)} />
      )}

      {(hasPlayed || !payload.clip_path) && (
        <div className="mt-4 flex items-center gap-3">
          {recorder.state !== "recording" ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={uploading}
              className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
            >
              ● Record
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="rounded-full bg-red-500 px-5 py-2 text-sm font-medium text-white"
            >
              ■ Stop (max {payload.response_window_sec}s)
            </button>
          )}
          {uploading && <span className="text-xs text-[var(--secondary)]">Uploading...</span>}
          {value?.audio_path && !uploading && (
            <span className="text-xs text-[var(--mint-dark)]">✓ Recorded</span>
          )}
        </div>
      )}

      {recorder.error && <p className="mt-2 text-xs text-red-600">{recorder.error}</p>}
      {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}
    </div>
  );
}
