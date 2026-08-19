"use client";

// TOEFL 데모 Listening 오디오 생성 트리거 화면. 학생용 아님, 관리자 전용 1회성 도구.
// /api/admin/toefl/generate-demo-audio를 호출해 TOEFL_DEMO_001의 Listening 오디오를 만든다.

import { useEffect, useState } from "react";
import Topbar from "@/components/toefl/admin/Topbar";
import { useAdminMe } from "@/lib/toefl/admin-me";
import { createClient } from "@/lib/supabase/client";

type LogEntry = { kind: string; id: string; status: string; message: string };

export default function ToeflAudioAdminPage() {
  const me = useAdminMe();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run(force: boolean) {
    setRunning(true);
    setError(null);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch(`/api/admin/toefl/generate-demo-audio${force ? "?force=1" : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setRunning(false);
    if (!res.ok || !data.ok) {
      setError(data.message ?? "생성에 실패했습니다.");
      return;
    }
    setLog(data.log ?? []);
  }

  return (
    <>
      <Topbar title="오디오(TTS) 관리" crumb="Listening 지문·문항의 음성을 만듭니다" role={me.role} name={me.name} />
      <div className="max-w-3xl">
        <p className="text-[13px] text-[var(--en-ink-soft)]">
          TOEFL_DEMO_001의 Listening 지문·문항에 Gemini TTS로 실제 음성을 만들어 채웁니다. 이미 있는 항목은
          건너뜁니다(다시 만들려면 아래 "강제로 다시 생성" 사용).
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => run(false)}
            disabled={running}
            className="rounded-full bg-[var(--pink)] px-6 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {running ? "생성 중..." : "오디오 생성"}
          </button>
          <button
            onClick={() => run(true)}
            disabled={running}
            className="rounded-full border border-[var(--border-c)] px-6 py-2.5 text-sm text-[var(--foreground)] disabled:opacity-60"
          >
            강제로 다시 생성
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {log.length > 0 && (
          <ul className="mt-6 space-y-1.5 text-sm">
            {log.map((l, i) => (
              <li
                key={i}
                className={
                  l.status === "generated"
                    ? "text-[var(--mint-dark)]"
                    : l.status === "error"
                    ? "text-red-600"
                    : "text-[var(--secondary)]"
                }
              >
                [{l.kind}] {l.id.slice(0, 8)}… — {l.status}: {l.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
