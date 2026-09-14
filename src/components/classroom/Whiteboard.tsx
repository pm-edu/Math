"use client";

// 실시간 판서(화이트보드). Excalidraw를 그대로 라이브러리로 불러와 쓰고, 그린 내용을
// Supabase Realtime Broadcast로 같은 강의실(channel) 참가자에게 그대로 전달한다.
// 서버에 매번 쓰지 않고 브라우저끼리 직접 주고받는 방식이라 그리는 동안은 DB 부하가 없다.
// 새로고침·재입장 대비로 classroom_sessions.whiteboard_data 에 마지막 상태만 스냅샷 저장한다.

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Excalidraw는 브라우저 전용(캔버스·window 접근)이라 서버 렌더링에서 빼야 한다.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, { ssr: false }) as unknown as React.ComponentType<ExcalidrawProps>;

export function Whiteboard({ sessionId, initialData }: { sessionId: string; initialData: unknown }) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const applyingRemoteRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`classroom-board:${sessionId}`, { config: { broadcast: { self: false } } });

    channel.on("broadcast", { event: "scene" }, ({ payload }) => {
      if (!apiRef.current) return;
      applyingRemoteRef.current = true;
      apiRef.current.updateScene({ elements: payload.elements });
      applyingRemoteRef.current = false;
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessionId]);

  function handleChange(elements: readonly unknown[]) {
    if (applyingRemoteRef.current) return; // 방금 원격에서 받은 변경을 다시 안 돌려보냄
    channelRef.current?.send({ type: "broadcast", event: "scene", payload: { elements } });

    // 그릴 때마다 저장하면 너무 잦아서, 마지막 변경 후 3초 조용하면 한 번만 스냅샷 저장.
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      createClient().from("classroom_sessions").update({ whiteboard_data: { elements } }).eq("id", sessionId);
    }, 3000);
  }

  return (
    <div className="h-full w-full">
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={{ elements: (initialData as { elements?: unknown[] } | null)?.elements ?? [] } as ExcalidrawProps["initialData"]}
        onChange={(elements) => handleChange(elements)}
      />
    </div>
  );
}
