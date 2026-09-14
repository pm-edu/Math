"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  ParticipantTile,
  useTracks,
  useDisconnectButton,
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
  teacherId?: string;
  livekitUrl?: string;
};

export default function ClassroomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"loading" | "gate" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<TokenResponse | null>(null);
  const [whiteboardInitial, setWhiteboardInitial] = useState<unknown>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // 브라우저가 막았거나 지원하지 않음 — 조용히 무시.
    }
  }

  // 학생은 "강의실 입장하기"를 누르는 그 클릭에서 바로 전체화면을 신청해야 브라우저가
  // 허용한다(페이지 로드만으로는 사용자 제스처로 안 쳐줌) — 2026-09-14, "학생들은
  // 브라우저 메뉴를 못 쓰게 하고 싶다"는 요청으로 입장 화면을 하나 더 둠.
  function handleEnterAsStudent() {
    // 전체화면 요청 결과를 기다리지 않고 바로 입장시킨다 — 브라우저가 거부하거나
    // 응답이 늦어도(정책상 막힌 경우 등) 학생이 입장 자체를 못 하는 일은 없어야 한다.
    document.documentElement.requestFullscreen().catch(() => {});
    setState("ready");
  }

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
      setState(data.isTeacher ? "ready" : "gate");
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

  if (state === "gate") {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--background)] px-6 text-center">
        <p className="text-lg font-medium text-[var(--foreground)]">{info?.title}</p>
        <p className="text-sm text-[var(--secondary)]">입장하면 전체 화면으로 전환됩니다.</p>
        <button
          type="button"
          onClick={handleEnterAsStudent}
          className="rounded-full bg-[var(--pink)] px-8 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          강의실 입장하기
        </button>
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
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute left-3 top-3 z-20 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white hover:bg-black/80"
      >
        {isFullscreen ? "강의실 전체화면 종료" : "강의실 전체화면"}
      </button>
      <LiveKitRoom
        token={info.token}
        serverUrl={info.livekitUrl}
        connect
        video
        audio
        data-lk-theme="default"
        className="flex h-full flex-col"
      >
        <div className="flex shrink-0 items-stretch border-b border-[var(--border-c)] bg-black/90">
          <ControlBar variation="minimal" controls={{ leave: false }} className="flex-1" />
          <div className="flex items-center pr-3">
            <LeaveButton />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <Whiteboard sessionId={id} initialData={whiteboardInitial} />
        </div>
        <FloatingParticipants teacherId={info.teacherId ?? null} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

function LeaveButton() {
  const { buttonProps } = useDisconnectButton({});

  function handleClick() {
    // 실수로 눌러 화상·음성 연결이 바로 끊기는 걸 막는다(판서는 이미 저장돼 있어 재입장 시
    // 이어서 볼 수 있지만, 수업 도중 끊기면 되돌릴 수 없어서).
    const ok = window.confirm("강의실에서 나가시겠습니까? 화상·음성 연결이 끊어집니다.");
    if (ok) buttonProps.onClick();
  }

  return (
    <button
      type="button"
      className="lk-button lk-disconnect-button"
      onClick={handleClick}
      disabled={buttonProps.disabled}
    >
      나가기
    </button>
  );
}

// 브라우저 기본 PIP는 영상 1개만 띄울 수 있어 참가자가 여럿이면 쓸 수 없다 — 대신 페이지
// 안에 늘 떠 있는(전체화면 중에도 사라지지 않는) 작은 패널을 직접 그린다. 선생님을 자동으로
// 맨 앞(크게)에 놓고, 나머지는 그 아래 작은 썸네일로 늘어놓는다. 드래그로 위치를 옮길 수
// 있다(2026-09-14, "학생·선생 여러 명이 같이 보이고 드래그도 되면 좋겠다"는 요청).
function FloatingParticipants({ teacherId }: { teacherId: string | null }) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);

  useEffect(() => {
    function onDrag(e: PointerEvent) {
      const s = dragRef.current;
      const panel = panelRef.current;
      if (!s || !panel) return;
      const rect = panel.getBoundingClientRect();
      const left = Math.min(Math.max(0, s.startLeft + (e.clientX - s.startX)), window.innerWidth - rect.width);
      const top = Math.min(Math.max(0, s.startTop + (e.clientY - s.startY)), window.innerHeight - rect.height);
      setPos({ left, top });
    }
    function onDrop() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", onDrop);
    return () => {
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onDrop);
    };
  }, []);

  function startDrag(e: React.PointerEvent) {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
  }

  if (tracks.length === 0) return null;

  const sorted = [...tracks].sort((a, b) => {
    const aTeacher = a.participant.identity === teacherId;
    const bTeacher = b.participant.identity === teacherId;
    return aTeacher === bTeacher ? 0 : aTeacher ? -1 : 1;
  });
  const [featured, ...rest] = sorted;

  return (
    <div
      ref={panelRef}
      style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
      className="fixed bottom-4 right-4 z-30 w-48 select-none rounded-lg bg-black/80 p-1.5 shadow-lg"
    >
      <div
        onPointerDown={startDrag}
        className="mb-1 cursor-move rounded bg-white/10 py-0.5 text-center text-[10px] tracking-widest text-white/70"
      >
        ⠿⠿⠿
      </div>
      <div className="overflow-hidden rounded" style={{ aspectRatio: "16 / 9" }}>
        <ParticipantTile trackRef={featured} />
      </div>
      {rest.length > 0 && (
        <div className="mt-1 flex gap-1 overflow-x-auto">
          {rest.map((t) => (
            <div key={`${t.participant.identity}-${t.source}`} className="h-10 w-16 shrink-0 overflow-hidden rounded">
              <ParticipantTile trackRef={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
