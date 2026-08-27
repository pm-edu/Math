import { useCallback, useEffect, useRef, useState } from "react";

// MediaRecorder 래퍼(useAudioRecorder.ts를 대체). spec §11 6번: audio/webm;codecs=opus 우선,
// Safari 등 미지원 브라우저는 audio/mp4로 폴백(/toefl/check의 마이크 자가진단과 같은
// getUserMedia+AnalyserNode 패턴을 그대로 따름 — 레벨 스케일도 0~100으로 맞춤).
// 녹음 자체만 담당 — 업로드는 recordingUploadQueue가 한다.

export type RecorderState = "idle" | "recording" | "stopped" | "error";

const SILENCE_THRESHOLD = 4; // check 페이지 레벨 스케일(0~100) 기준 사실상 무음
const SILENCE_GRACE_MS = 1500; // 녹음 시작 직후 워밍업 구간은 무음 판정에서 제외
const SILENCE_SUSTAIN_MS = 2000; // 이 시간 이상 계속 무음이어야 경고

function pickMimeType(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return { mimeType: "audio/webm;codecs=opus", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/webm")) return { mimeType: "audio/webm", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/mp4")) return { mimeType: "audio/mp4", ext: "mp4" }; // Safari
  return { mimeType: "", ext: "webm" };
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // 0~100
  const [isSilent, setIsSilent] = useState(false);
  const [mimeType, setMimeType] = useState<string>("audio/webm");
  const [ext, setExt] = useState<string>("webm");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const silentSinceRef = useRef<number | null>(null);

  const cleanupAudioAnalysis = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => cleanupAudioAnalysis, [cleanupAudioAnalysis]);

  const start = useCallback(async (deviceId?: string) => {
    setError(null);
    setIsSilent(false);
    silentSinceRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;

      const picked = pickMimeType();
      mimeTypeRef.current = picked.mimeType || "audio/webm";
      setMimeType(mimeTypeRef.current);
      setExt(picked.ext);

      const recorder = new MediaRecorder(stream, picked.mimeType ? { mimeType: picked.mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupAudioAnalysis();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current = recorder;

      // 녹음 중 마이크 권한이 OS/브라우저에서 철회되면 활성 트랙이 즉시 종료된다 — 이걸 놓치면
      // "녹음 중" 화면에 무음으로 계속 머물러 있게 된다(요청: 즉시 감지→무효 처리).
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          setError("Microphone access was turned off during recording.");
          setState("error");
        };
      }

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      setState("recording");

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        const pct = Math.min(100, Math.round((avg / 128) * 100));
        setLevel(pct);

        const elapsed = Date.now() - recordingStartedAtRef.current;
        if (elapsed > SILENCE_GRACE_MS) {
          if (pct < SILENCE_THRESHOLD) {
            if (silentSinceRef.current === null) silentSinceRef.current = Date.now();
            setIsSilent(Date.now() - silentSinceRef.current > SILENCE_SUSTAIN_MS);
          } else {
            silentSinceRef.current = null;
            setIsSilent(false);
          }
        }

        rafRef.current = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      setError("Microphone access was denied or is unavailable.");
      setState("error");
    }
  }, [cleanupAudioAnalysis]);

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
          setLevel(0);
          resolve(blob);
        },
        { once: true }
      );
      recorder.stop();
    });
  }, []);

  return { state, error, level, isSilent, mimeType, ext, start, stop };
}
