"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import type { Profile } from "@/lib/profile";

type ClassroomSession = {
  id: string;
  title: string;
  teacher_id: string;
  status: string;
  created_at: string;
};

export default function AdminClassroomPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ClassroomSession[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [participantsBySession, setParticipantsBySession] = useState<Record<string, string[]>>({});
  const [pickedBySession, setPickedBySession] = useState<Record<string, string[]>>({});

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("classroom_sessions").select("*").order("created_at", { ascending: false });
    setSessions((data ?? []) as ClassroomSession[]);

    const { data: parts } = await supabase.from("classroom_participants").select("session_id, user_id");
    const map: Record<string, string[]> = {};
    for (const p of parts ?? []) {
      const list = map[p.session_id] ?? [];
      list.push(p.user_id);
      map[p.session_id] = list;
    }
    setParticipantsBySession(map);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (!canManageMaterials(me?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      setMyId(auth.user.id);
      const { data: studs } = await supabase.from("profiles").select("*").eq("role", "student").order("created_at", { ascending: false });
      setStudents((studs ?? []) as Profile[]);
      await loadSessions();
    }
    init();
  }, [router, loadSessions]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!title.trim()) {
      setError("강의실 이름을 입력해주세요.");
      return;
    }
    if (!myId) return;
    setSaving(true);
    const { error: insErr } = await createClient()
      .from("classroom_sessions")
      .insert({ title: title.trim(), teacher_id: myId });
    setSaving(false);
    if (insErr) {
      setError(`생성 실패: ${insErr.message}`);
      return;
    }
    setTitle("");
    setMessage(`"${title}" 강의실을 만들었습니다.`);
    loadSessions();
  }

  function togglePick(sessionId: string, studentId: string) {
    setPickedBySession((prev) => {
      const cur = prev[sessionId] ?? [];
      const next = cur.includes(studentId) ? cur.filter((x) => x !== studentId) : [...cur, studentId];
      return { ...prev, [sessionId]: next };
    });
  }

  async function assignStudents(sessionId: string) {
    const ids = pickedBySession[sessionId] ?? [];
    if (ids.length === 0) {
      setError("배정할 학생을 한 명 이상 선택하세요.");
      return;
    }
    setError(null);
    setMessage(null);
    const rows = ids.map((uid) => ({ session_id: sessionId, user_id: uid }));
    const { error: assignErr } = await createClient()
      .from("classroom_participants")
      .upsert(rows, { onConflict: "session_id,user_id" });
    if (assignErr) {
      setError(`배정 실패: ${assignErr.message}`);
      return;
    }
    setMessage(`${ids.length}명을 배정했습니다.`);
    setPickedBySession((prev) => ({ ...prev, [sessionId]: [] }));
    loadSessions();
  }

  if (allowed === null) return <Shell><p className="text-sm text-[var(--secondary)]">확인 중...</p></Shell>;
  if (allowed === false) {
    return (
      <Shell>
        <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <Link href="/mypage" className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]">
          마이페이지로
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link href="/admin/math" className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]">
        ← 대시보드로
      </Link>
      <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">화상 강의실</h1>
      <p className="mt-2 text-sm text-[var(--secondary)]">
        판서(화이트보드)와 실시간 화상·음성으로 소그룹 수업을 진행합니다.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-4 text-sm text-[var(--mint-dark)]">{message}</p>}

      <form onSubmit={handleCreate} className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border-c)] bg-white p-6">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="강의실 이름 (예: 중2 목요반)"
          className="min-w-[240px] flex-1 rounded-lg border border-[var(--border-c)] px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[var(--pink)] px-6 py-2.5 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
        >
          {saving ? "만드는 중..." : "강의실 만들기"}
        </button>
      </form>

      <div className="mt-10 space-y-6">
        {sessions.length === 0 && <p className="text-sm text-[var(--secondary)]">아직 만든 강의실이 없습니다.</p>}
        {sessions.map((s) => {
          const assignedIds = participantsBySession[s.id] ?? [];
          const picked = pickedBySession[s.id] ?? [];
          return (
            <div key={s.id} className="rounded-2xl border border-[var(--border-c)] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-[var(--foreground)]">{s.title}</h2>
                  <p className="text-xs text-[var(--secondary)]">
                    상태: {s.status === "live" ? "진행 중" : s.status === "ended" ? "종료됨" : "예정"} · 배정된 학생 {assignedIds.length}명
                  </p>
                </div>
                <Link
                  href={`/classroom/${s.id}`}
                  className="rounded-full bg-[var(--pink)] px-5 py-2 text-sm font-medium text-[var(--pink-dark)]"
                >
                  입장하기
                </Link>
              </div>

              <p className="mt-4 text-sm font-medium text-[var(--foreground)]">배정할 학생 선택 (여러 명 가능)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {students.map((st) => {
                  const already = assignedIds.includes(st.id);
                  const isPicked = picked.includes(st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => togglePick(s.id, st.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        already
                          ? "border-[var(--mint-dark)] bg-[var(--mint)]/40 text-[var(--mint-dark)]"
                          : isPicked
                          ? "border-[var(--pink)] bg-[var(--pink-light)]/40 text-[var(--pink-dark)]"
                          : "border-[var(--border-c)] bg-white text-[var(--secondary)]"
                      }`}
                    >
                      {already ? "✓ " : ""}
                      {st.name ?? st.email}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => assignStudents(s.id)}
                disabled={picked.length === 0}
                className="mt-3 rounded-full border border-[var(--border-c)] px-4 py-1.5 text-xs font-medium text-[var(--secondary)] disabled:opacity-40"
              >
                선택 {picked.length}명 배정
              </button>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl bg-[var(--background)] px-6 py-16">{children}</main>
      <Footer />
    </>
  );
}
