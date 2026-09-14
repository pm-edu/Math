"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  GridLayout,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { createClient } from "@/lib/supabase/client";
import { Whiteboard } from "@/components/classroom/Whiteboard";

type TokenResponse = {
  ok: boolean;
  message?: string;
  token?: string;
  room?: string;
  title?: string;
  isTeacher?: boolean;
  livekitUrl?: string;
};

export default function ClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<TokenResponse | null>(null);
  const [whiteboardInitial, setWhiteboardInitial] = useState<unknown>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;

      const { data: sessionRow } = await supabase.from("classroom_sessions").select("whiteboard_data").eq("id", id).maybeSingle();
      setWhiteboardInitial(sessionRow?.whiteboard_data ?? null);

      const res = await fetch(`/api/classroom/${id}/token`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await res.json()) as TokenResponse;
      if (!res.ok || !data.ok) {
        setError(data.message ?? "입장할 수 없습니다.");
        setState("error");
        return;
      }
      setInfo(data);
      setState("ready");
    }
    init();
  }, [id, router]);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--secondary)]">불러오는 중...</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/mypage" className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          마이페이지로
        </Link>
      </main>
    );
  }

  if (!info?.livekitUrl) {
    // LiveKit 키가 아직 설정 안 된 상태 — 화이트보드만이라도 쓸 수 있게 한다.
    return (
      <main className="flex h-screen flex-col bg-[var(--background)]">
        <div className="border-b border-[var(--border-c)] bg-white px-6 py-3">
          <p className="text-sm font-medium text-[var(--foreground)]">{info?.title}</p>
          <p className="text-xs text-amber-600">화상·음성은 아직 설정 중입니다 — 판서만 우선 사용할 수 있습니다.</p>
        </div>
        <div className="flex-1">
          <Whiteboard sessionId={id} initialData={whiteboardInitial} />
        </div>
      </main>
    );
  }

  return (
    // h-screen(100vh)은 임베드된 프레임 등에서 실제 뷰포트와 다르게 계산되는 경우가 있어
    // (2026-09-14 실사용 중 발견 — 화이트보드 영역이 높이 0이 돼버림) fixed inset-0로
    // 화면 자체를 명시적으로 꽉 채운다.
    <div className="fixed inset-0 bg-[var(--background)]">
      <LiveKitRoom token={info.token} serverUrl={info.livekitUrl} connect video audio className="flex h-full flex-col">
        <div className="shrink-0 border-b border-[var(--border-c)] bg-black/90">
          <div className="h-44">
            <VideoGrid />
          </div>
          <ControlBar variation="minimal" />
        </div>
        <div className="min-h-0 flex-1">
          <Whiteboard sessionId={id} initialData={whiteboardInitial} />
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

function VideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPip, setIsPip] = useState(false);
  // VideoGrid는 강의실 데이터 로드 후(마운트 시점에 이미 클라이언트)에만 렌더되므로
  // SSR 시 document가 없는 것과의 하이드레이션 불일치 걱정 없이 바로 계산해도 된다.
  const pipSupported = typeof document !== "undefined" && document.pictureInPictureEnabled;

  useEffect(() => {
    function onEnter() {
      setIsPip(true);
    }
    function onLeave() {
      setIsPip(false);
    }
    document.addEventListener("enterpictureinpicture", onEnter, true);
    document.addEventListener("leavepictureinpicture", onLeave, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", onEnter, true);
      document.removeEventListener("leavepictureinpicture", onLeave, true);
    };
  }, []);

  async function togglePip() {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    const video = containerRef.current?.querySelector("video");
    if (!video) return;
    try {
      await video.requestPictureInPicture();
    } catch {
      // 팝업(PIP) 요청 실패 — 지원 브라우저가 아니거나 아직 화면이 준비 안 된 경우, 조용히 무시.
    }
  }

  return (
    <div ref={containerRef} className="relative h-full">
      <GridLayout tracks={tracks} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
      {pipSupported && (
        <button
          type="button"
          onClick={togglePip}
          className="absolute right-2 top-2 z-10 rounded bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
        >
          {isPip ? "팝업 닫기" : "팝업으로 보기"}
        </button>
      )}
    </div>
  );
}
