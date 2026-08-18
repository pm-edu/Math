"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

// Speaking 녹음 업로드 재시도 큐(모듈 싱글턴). Speaking 응시화면은 activeItem 하나만 그리므로
// 문항을 넘기면 그 문항의 녹음 컴포넌트는 언마운트된다 — 재시도 타이머를 컴포넌트 state에
// 두면 다음 문항으로 넘어가는 순간 끊긴다. 그래서 컴포넌트 밖에 둬서 (1) 문항을 이동해도
// 백그라운드 재시도가 계속되고 (2) 제출 버튼을 누르는 시점에 "아직 안 끝난 업로드가 있는지"를
// 페이지가 한 곳에서 물어볼 수 있게 한다.
// 구독은 useSyncExternalStore로 한다(React가 외부 스토어 구독용으로 권장하는 API) — 스냅샷은
// notify() 시점에만 새로 만들고 그 사이엔 같은 참조를 반환해야 불필요한 리렌더가 안 생긴다.

export type UploadStatus = "uploading" | "pending_retry" | "failed" | "done";

export type UploadTaskView = {
  itemId: string;
  path: string;
  status: UploadStatus;
  attempts: number;
  error?: string;
};

type UploadTask = UploadTaskView & { blob: Blob; contentType: string; onDone: (path: string) => void };

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s, 8s, 16s
const EMPTY_LIST: UploadTaskView[] = [];

type Listener = () => void;

class RecordingUploadQueue {
  private tasks = new Map<string, UploadTask>();
  private listeners = new Set<Listener>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  private viewCache = new Map<string, UploadTaskView>();
  private listSnapshot: UploadTaskView[] = EMPTY_LIST;
  private pendingSnapshot: UploadTaskView[] = EMPTY_LIST;
  private hasPendingSnapshot = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private recompute() {
    this.viewCache = new Map();
    for (const t of this.tasks.values()) {
      this.viewCache.set(t.itemId, { itemId: t.itemId, path: t.path, status: t.status, attempts: t.attempts, error: t.error });
    }
    this.listSnapshot = [...this.viewCache.values()];
    this.pendingSnapshot = this.listSnapshot.filter((t) => t.status !== "done");
    this.hasPendingSnapshot = this.pendingSnapshot.length > 0;
  }

  private notify() {
    this.recompute();
    this.listeners.forEach((fn) => fn());
  }

  get(itemId: string): UploadTaskView | null {
    return this.viewCache.get(itemId) ?? null;
  }

  list(): UploadTaskView[] {
    return this.listSnapshot;
  }

  pendingList(): UploadTaskView[] {
    return this.pendingSnapshot;
  }

  hasPending(): boolean {
    return this.hasPendingSnapshot;
  }

  enqueue(itemId: string, path: string, blob: Blob, contentType: string, onDone: (path: string) => void) {
    const existingTimer = this.timers.get(itemId);
    if (existingTimer) clearTimeout(existingTimer);
    this.tasks.set(itemId, { itemId, path, status: "uploading", attempts: 0, blob, contentType, onDone });
    this.notify();
    this.attempt(itemId);
  }

  retryNow(itemId: string) {
    const t = this.tasks.get(itemId);
    if (!t || t.status === "done") return;
    const existingTimer = this.timers.get(itemId);
    if (existingTimer) clearTimeout(existingTimer);
    t.status = "uploading";
    this.notify();
    this.attempt(itemId);
  }

  private async attempt(itemId: string) {
    const t = this.tasks.get(itemId);
    if (!t) return;
    t.attempts += 1;
    t.status = "uploading";
    this.notify();

    const supabase = createClient();
    const { error } = await supabase.storage
      .from("toefl-recordings")
      .upload(t.path, t.blob, { contentType: t.contentType, upsert: true });

    const current = this.tasks.get(itemId);
    if (!current) return; // 재생 도중 clear()됐을 수 있음

    if (!error) {
      current.status = "done";
      current.error = undefined;
      this.notify();
      current.onDone(current.path);
      return;
    }

    current.error = error.message;
    if (current.attempts >= MAX_ATTEMPTS) {
      current.status = "failed";
      this.notify();
      return;
    }
    current.status = "pending_retry";
    this.notify();
    const delay = BASE_DELAY_MS * 2 ** (current.attempts - 1);
    const timer = setTimeout(() => this.attempt(itemId), delay);
    this.timers.set(itemId, timer);
  }

  clear(itemId: string) {
    const timer = this.timers.get(itemId);
    if (timer) clearTimeout(timer);
    this.timers.delete(itemId);
    this.tasks.delete(itemId);
    this.notify();
  }
}

export const recordingUploadQueue = new RecordingUploadQueue();

export function useUploadTask(itemId: string): UploadTaskView | null {
  return useSyncExternalStore(
    (onChange) => recordingUploadQueue.subscribe(onChange),
    () => recordingUploadQueue.get(itemId),
    () => null
  );
}

// 제출 직전 "미업로드 녹음이 있는지" 확인용(응시 페이지가 씀).
export function useHasPendingUploads(): boolean {
  return useSyncExternalStore(
    (onChange) => recordingUploadQueue.subscribe(onChange),
    () => recordingUploadQueue.hasPending(),
    () => false
  );
}

export function usePendingUploadTasks(): UploadTaskView[] {
  return useSyncExternalStore(
    (onChange) => recordingUploadQueue.subscribe(onChange),
    () => recordingUploadQueue.pendingList(),
    () => EMPTY_LIST
  );
}
