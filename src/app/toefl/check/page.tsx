"use client";

// TOEFL 사전 점검 화면. docs/toefl-spec.md §11.
// 진입화면(/toefl)에서 "Start Full Test"/"Practice"를 누르면 곧장 attempt를 만들지 않고
// 여기부터 거친다 — 아직 attempt가 없는 시점이라 form/mode/section을 쿼리 파라미터로 받는다
// (요청에는 /toefl/check/[attemptId]로 돼 있었지만, attempt를 미리 만들면 서버 타이머
// (deadline_at)가 사전 점검을 하는 동안에도 흘러버려서 응시 시간을 까먹게 된다 — 그래서 실제
// attempt 생성(POST /api/toefl/attempts)을 "시작하기" 클릭 시점으로 그대로 미뤄뒀다. 기존
// 진입화면 로직을 그대로 여기로 옮겨온 것뿐이라 서버 쪽엔 변경이 없다).
// 모든 항목을 통과해야 "시작하기"가 활성화된다.
// 언어 토글 적용 대상(2026-08-18) — 안내 화면이라 §14의 "응시 화면 영어전용"과 무관하다.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ToeflHeader from "@/components/toefl/ToeflHeader";
import { interpolate, useLang } from "@/lib/i18n";
import type { ToeflSection } from "@/lib/toefl/types";

const MIN_SCREEN_WIDTH = 1024;
const MIC_TEST_MS = 3000;

type MicPhase = "idle" | "recording" | "review" | "denied";

function detectSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|chromium|crios|android|fxios|edg/i.test(ua);
}

export default function ToeflCheckPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLang();
  const formId = params.get("formId");
  const mode = params.get("mode") === "full" ? "full" : "section_practice";
  const section = params.get("section") as ToeflSection | null;

  // full 모드는 결국 Speaking까지 가고, section_practice는 그 영역이 speaking일 때만 필요하다.
  const needsSpeaking = mode === "full" || section === "speaking";
  // 오디오 체크는 실제로 오디오를 듣는 영역(Listening/Speaking)에만 의미가 있다 — Reading·
  // Writing 연습에는 소리 자체가 안 나오는데 "Audio check"를 보여주는 게 이상하다는 지적으로
  // 추가함(실사용 피드백, 2026-08-18). needsSpeaking과 항상 같지 않다 — Listening 단독
  // 연습은 오디오는 필요하지만 마이크는 필요 없다.
  const needsAudio = mode === "full" || section === "listening" || section === "speaking";

  // 항목이 조건부로 숨겨지다 보니 번호를 "1./2./3."으로 고정해두면 마이크 체크가 없을 때
  // "1, 3"처럼 번호가 비는 문제가 있었다(실사용 피드백) — 실제로 보이는 항목 순서대로 다시 매긴다.
  let stepCounter = 0;
  const audioStep = needsAudio ? ++stepCounter : null;
  const micStep = needsSpeaking ? ++stepCounter : null;
  const noticesStep = ++stepCounter;

  const [audioPlayed, setAudioPlayed] = useState(false);
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [micPhase, setMicPhase] = useState<MicPhase>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [micBlobUrl, setMicBlobUrl] = useState<string | null>(null);
  const [micConfirmed, setMicConfirmed] = useState(false);
  // 화면 검토(2026-08-27) [C]: 장치 재선택 — 여러 마이크가 연결돼 있으면 고를 수 있게 한다.
  // 라벨은 권한을 한 번 허용해야 채워지므로(브라우저 정책), 최소 한 번 마이크 테스트를 마친
  // 뒤에야 목록이 의미 있게 보인다 — 그래서 review 단계에서만 노출한다.
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [screenWidth, setScreenWidth] = useState<number | null>(null);
  const [noticesAcked, setNoticesAcked] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    function update() {
      setScreenWidth(window.innerWidth);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (micBlobUrl) URL.revokeObjectURL(micBlobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 볼륨 확인용 짧은 비프음 — 실제 시험 문항 오디오를 "테스트용"으로 소모하지 않도록
  // Web Audio API로 직접 생성한다(외부 파일·서버 호출 불필요).
  function playTestTone() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => {
      ctx.close();
      setAudioPlayed(true);
    };
  }

  async function startMicTest(deviceId?: string) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      streamRef.current = stream;
      setMicPhase("recording");

      // 권한이 허용된 뒤에야 장치 라벨이 채워진다(브라우저 정책) — 그래서 재생목록은 여기,
      // 첫 성공한 getUserMedia 이후에 채운다.
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => setMicDevices(devices.filter((d) => d.kind === "audioinput")))
        .catch(() => {});

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
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      }
      tick();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        audioCtx.close();
        stream.getTracks().forEach((t) => t.stop());
        setMicBlobUrl(URL.createObjectURL(new Blob(chunks, { type: mimeType })));
        setMicPhase("review");
      };
      recorder.start();
      setTimeout(() => recorder.stop(), MIC_TEST_MS);
    } catch {
      setMicPhase("denied");
    }
  }

  const screenOk = mode !== "full" || screenWidth === null || screenWidth >= MIN_SCREEN_WIDTH;
  const canStart = (!needsAudio || audioConfirmed) && (!needsSpeaking || micConfirmed) && screenOk && noticesAcked;

  async function handleStart() {
    if (!formId) return;
    setError(null);
    setStarting(true);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/toefl/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(mode === "full" ? { form_id: formId, mode: "full" } : { form_id: formId, mode: "section_practice", section }),
    });
    const data = await res.json();
    setStarting(false);
    if (!res.ok || !data.ok) {
      setError(data.message ?? t("toefl_failedToStart"));
      return;
    }
    router.push(`/toefl/test/${data.attempt_id}/${mode === "full" ? "reading" : section}`);
  }

  if (!formId || (mode === "section_practice" && !section)) {
    return (
      <div data-theme="en" className="min-h-screen bg-[var(--background)]">
        <ToeflHeader />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <p className="text-sm text-red-600">⚠ {t("toefl_missingSelection")}</p>
          <button onClick={() => router.push("/toefl")} className="mt-4 text-sm text-[var(--secondary)] underline">
            {t("toefl_backHome")}
          </button>
        </main>
      </div>
    );
  }

  const isSafari = detectSafari();

  return (
    <div data-theme="en" className="min-h-screen bg-[var(--background)]">
      <ToeflHeader />
      <main className="mx-auto max-w-lg px-6 py-16">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">{t("toefl_checkTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">{t("toefl_checkSubtitle")}</p>

        {needsSpeaking && isSafari && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {t("toefl_safariWarning")}
          </div>
        )}

        {mode === "full" && !screenOk && (
          <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
            <p className="font-medium">{interpolate(t("toefl_screenTooNarrow"), { width: MIN_SCREEN_WIDTH })}</p>
            <p className="mt-1">{t("toefl_screenTooNarrowFix")}</p>
          </div>
        )}

        {/* 오디오 재생 테스트 — Listening/Speaking이 있을 때만(Reading·Writing엔 소리가 안 나옴) */}
        {needsAudio && (
          <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {audioStep}. {t("toefl_audioCheckLabel")}
            </p>
            <p className="mt-1 text-xs text-[var(--secondary)]">{t("toefl_audioCheckDesc")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={playTestTone}
                className="rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)]"
              >
                {t("toefl_playTestSound")}
              </button>
              {audioPlayed && (
                <button
                  type="button"
                  onClick={playTestTone}
                  className="rounded-full border border-[var(--border-c)] px-4 py-1.5 text-xs font-medium text-[var(--secondary)]"
                >
                  🔁 {t("toefl_replaySound")}
                </button>
              )}
            </div>
            {audioPlayed && (
              <>
                <p className="mt-2 text-[11px] text-[var(--secondary)]">{t("toefl_volumeOutputHint")}</p>
                <label className="mt-2 flex items-center gap-2 text-xs text-[var(--foreground)]">
                  <input type="checkbox" checked={audioConfirmed} onChange={(e) => setAudioConfirmed(e.target.checked)} />
                  {t("toefl_heardClearly")}
                </label>
              </>
            )}
          </section>
        )}

        {/* 마이크 테스트 (Speaking 포함시만) */}
        {needsSpeaking && (
          <section className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-5">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {micStep}. {t("toefl_micCheckLabel")}
            </p>
            <p className="mt-1 text-xs text-[var(--secondary)]">{t("toefl_micCheckDesc")}</p>

            {micPhase === "idle" && (
              <button
                type="button"
                onClick={() => startMicTest()}
                className="mt-3 rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)]"
              >
                {t("toefl_record3s")}
              </button>
            )}

            {micPhase === "recording" && (
              <div className="mt-3">
                <p className="text-xs font-medium text-red-600">{t("toefl_recordingEllipsis")}</p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
                  <div className="h-full bg-[var(--mint-dark)] transition-all" style={{ width: `${micLevel}%` }} />
                </div>
              </div>
            )}

            {micPhase === "review" && micBlobUrl && (
              <div className="mt-3 space-y-2">
                <audio src={micBlobUrl} controls className="w-full" />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMicConfirmed(true);
                      const chosen = selectedMicId ?? micDevices[0]?.deviceId;
                      if (chosen) sessionStorage.setItem("toefl_mic_device_id", chosen);
                    }}
                    className="rounded-full border border-[var(--pink)] px-4 py-1.5 text-xs font-medium text-[var(--pink-dark)]"
                  >
                    {t("toefl_soundsGood")}
                  </button>
                  <button type="button" onClick={() => setMicPhase("idle")} className="text-xs text-[var(--secondary)] underline">
                    {t("toefl_recordAgain")}
                  </button>
                </div>
                {micConfirmed && <p className="text-xs text-[var(--mint-dark)]">{t("toefl_micConfirmed")}</p>}

                {micDevices.length > 1 && (
                  <div className="mt-2 border-t border-[var(--border-c)] pt-2">
                    <label className="block text-[11px] text-[var(--secondary)]">
                      {t("toefl_micDeviceLabel")}
                      <select
                        value={selectedMicId ?? micDevices[0]?.deviceId ?? ""}
                        onChange={(e) => setSelectedMicId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[var(--border-c)] bg-white px-2.5 py-1.5 text-xs"
                      >
                        {micDevices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMicConfirmed(false);
                        startMicTest(selectedMicId ?? micDevices[0]?.deviceId);
                      }}
                      className="mt-2 text-[11px] font-medium text-[var(--pink-dark)] underline"
                    >
                      {t("toefl_recheckWithDevice")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {micPhase === "denied" && (
              <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
                <p className="font-medium">⚠ {t("toefl_micBlocked")}</p>
                <p className="mt-1">
                  {isSafari ? t("toefl_micBlockedSafari") : t("toefl_micBlockedChrome")} {t("toefl_micBlockedFirefox")}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={() => startMicTest()} className="font-medium underline">
                    {t("toefl_tryAgain")}
                  </button>
                  {mode === "full" && (
                    <button
                      type="button"
                      onClick={() => router.push("/toefl")}
                      className="font-medium underline"
                    >
                      {t("toefl_continueWithoutSpeaking")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 유의사항 고지 — 항상 마지막 번호 */}
        <section className="mt-4 rounded-2xl border border-[var(--border-c)] bg-white p-5">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {noticesStep}. {t("toefl_beforeYouBegin")}
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--secondary)]">
            <li>{t("toefl_noticeAudioOnce")}</li>
            <li>{t("toefl_noticeNoReRecord")}</li>
            <li>{t("toefl_noticeTimerRuns")}</li>
          </ul>
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--foreground)]">
            <input type="checkbox" checked={noticesAcked} onChange={(e) => setNoticesAcked(e.target.checked)} />
            {t("toefl_iUnderstand")}
          </label>
        </section>

        {error && <p className="mt-4 text-sm text-red-600">⚠ {error}</p>}

        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="mt-6 w-full rounded-full bg-[var(--pink-dark)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {starting ? t("toefl_starting") : t("toefl_start")}
        </button>
        <button onClick={() => router.push("/toefl")} className="mt-3 w-full text-center text-sm text-[var(--secondary)] underline">
          {t("toefl_backHome")}
        </button>
      </main>
    </div>
  );
}
