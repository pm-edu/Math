import { useCallback, useRef, useState } from "react";

// MediaRecorder 래퍼. spec §11 6번: audio/webm;codecs=opus로 녹음.
// 녹음 자체만 담당 — 업로드는 호출하는 컴포넌트가 한다(어디에 올릴지는 문항마다 다르므로).

export type RecorderState = "idle" | "recording" | "stopped" | "error";

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState("recording");
    } catch {
      setError("Microphone access was denied or is unavailable.");
      setState("error");
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.addEventListener(
        "stop",
        () => {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          setState("stopped");
          resolve(blob);
        },
        { once: true }
      );
      recorder.stop();
    });
  }, []);

  return { state, error, start, stop };
}
