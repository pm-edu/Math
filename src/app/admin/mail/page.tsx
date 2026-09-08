"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";
import type { Worksheet } from "@/lib/problems";

type CourseOption = { id: string; title: string };
type Target = "all" | "course" | "selected" | "subscribers";

export default function AdminMailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /admin/toefl/students의 "메일 발송" 링크가 학생 하나를 미리 선택한 상태로 넘어온다
  // (화면 검토 2026-08-27 [B]) — 없으면 기존처럼 "전체"가 기본값이다.
  const preselectStudent = searchParams.get("student");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [myId, setMyId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);

  const [target, setTarget] = useState<Target>("all");
  const [courseId, setCourseId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // 문제지 PDF 첨부(선택)
  const [worksheetId, setWorksheetId] = useState("");
  const [attachProblems, setAttachProblems] = useState(true);
  const [attachAnswers, setAttachAnswers] = useState(true);
  const [previewing, setPreviewing] = useState<"problems" | "answers" | null>(null);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: me } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (me?.role !== "owner" && me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      setMyId(auth.user.id);
      setMyEmail(auth.user.email ?? null);

      const [courseRes, studentRes, worksheetRes, subCountRes] = await Promise.all([
        supabase.from("courses").select("id, title").order("created_at"),
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("worksheets").select("*").order("created_at", { ascending: false }),
        supabase.from("mailing_subscribers").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
      ]);
      setCourses((courseRes.data ?? []) as CourseOption[]);
      setStudents((studentRes.data ?? []) as Profile[]);
      setWorksheets((worksheetRes.data ?? []) as Worksheet[]);
      setSubscriberCount(subCountRes.count ?? 0);
      if (courseRes.data?.[0]) setCourseId(courseRes.data[0].id);
      if (preselectStudent) {
        setTarget("selected");
        setSelectedIds([preselectStudent]);
      }
    }
    init();
  }, [router, preselectStudent]);

  function toggleStudent(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // 문제지를 고르면, 실전 시험이면 해설을 기본으로 빼둔다(원칙: 시험은 결과 확인 후 해설 발송).
  function pickWorksheet(id: string) {
    setWorksheetId(id);
    const ws = worksheets.find((w) => w.id === id);
    setAttachProblems(true);
    setAttachAnswers(ws ? !ws.is_exam : true);
  }

  async function previewPdf(part: "problems" | "answers") {
    if (!worksheetId) return;
    setPreviewing(part);
    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    const res = await fetch(`/api/admin/worksheets/${worksheetId}/pdf?part=${part}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setPreviewing(null);
    if (!res.ok) {
      setError("미리보기를 불러오지 못했습니다.");
      return;
    }
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function handleSend() {
    setError(null);
    setResult(null);

    if (!subject.trim() || !message.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    if (target === "selected" && selectedIds.length === 0) {
      setError("받을 학생을 선택해주세요.");
      return;
    }
    if (target === "subscribers" && subscriberCount === 0) {
      setError("받을 구독자가 없습니다.");
      return;
    }

    const count =
      target === "all"
        ? students.length
        : target === "selected"
        ? selectedIds.length
        : target === "subscribers"
        ? subscriberCount
        : "선택한 강좌 수강생";
    if (!confirm(`${count}명에게 메일을 보낼까요?`)) return;

    setSending(true);

    // 줄바꿈을 <br> 로 바꿔 간단한 HTML 로 만든다.
    const html = message
      .split("\n")
      .map((line) => line || "&nbsp;")
      .join("<br>");

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subject: subject.trim(),
        html,
        target,
        courseId: target === "course" ? courseId : undefined,
        userIds: target === "selected" ? selectedIds : undefined,
        worksheetId: worksheetId || undefined,
        attachProblems: worksheetId ? attachProblems : undefined,
        attachAnswers: worksheetId ? attachAnswers : undefined,
      }),
    });

    const data = await res.json();
    setSending(false);

    if (!res.ok || !data.ok) {
      setError(data.message ?? "발송에 실패했습니다.");
      return;
    }
    setResult(`${data.count}명에게 보냈습니다.`);
    setSubject("");
    setMessage("");
    setSelectedIds([]);
    setWorksheetId("");
  }

  // 관리자 본인에게 테스트 메일을 보낸다 (실제 도착 확인용).
  async function handleTestToMe() {
    if (!myId) return;
    setError(null);
    setResult(null);
    setSending(true);

    const supabase = createClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: "[테스트] 메일 발송 확인",
        html: "이 메일이 보이면 발송 설정이 정상입니다. — 수학클래스",
        target: "selected",
        userIds: [myId],
      }),
    });
    const data = await res.json();
    setSending(false);

    if (!res.ok || !data.ok) {
      setError(data.message ?? "테스트 발송에 실패했습니다.");
      return;
    }
    setResult(`${myEmail ?? "내 계정"} 으로 테스트 메일을 보냈습니다. 받은편지함(스팸함 포함)을 확인하세요.`);
  }

  if (allowed === null) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm text-[var(--secondary)]">확인 중...</p>
        </main>
        <Footer />
      </>
    );
  }

  if (allowed === false) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-md px-6 py-24 text-center">
          <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
          <Link
            href="/mypage"
            className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
          >
            마이페이지로
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";
  const studentList = students.filter((s) => s.role === "student");
  const selectedWorksheet = worksheets.find((w) => w.id === worksheetId) ?? null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <Link
          href="/admin"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 학생 관리로
        </Link>

        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">메일 보내기</h1>
        <p className="mt-2 text-[var(--secondary)]">
          학생·구독자에게 학습자료 안내나 공지를 보냅니다. 자료는 링크로 넣거나, 아래에서 문제지 PDF를 첨부하세요.
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          {/* 받는 사람 */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">받는 사람</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["all", `전체 학생 (${studentList.length})`],
                  ["course", "강좌 수강생"],
                  ["selected", "직접 선택"],
                  ["subscribers", `이메일 구독자 (${subscriberCount})`],
                ] as [Target, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setTarget(value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    target === value
                      ? "bg-[var(--pink)] text-[var(--pink-dark)]"
                      : "border border-[var(--border-c)] bg-white text-[var(--secondary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {target === "course" && (
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className={inputClass}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}

            {target === "selected" && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-c)] p-3">
                {studentList.length === 0 ? (
                  <p className="text-sm text-[var(--secondary)]">학생이 없습니다.</p>
                ) : (
                  studentList.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      <span className="text-[var(--foreground)]">{s.name ?? "이름 없음"}</span>
                      <span className="text-[var(--secondary)]">{s.email}</span>
                    </label>
                  ))
                )}
              </div>
            )}

            {target === "subscribers" && (
              <p className="mt-2 text-xs text-[var(--secondary)]">
                계정 없이 이메일만 등록한 구독자입니다. 메일 맨 아래에 개인별 수신거부 링크가 자동으로 붙습니다.
              </p>
            )}
          </div>

          {/* 제목 */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">제목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="이번 주 학습자료 안내"
              className={inputClass}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="text-sm font-medium text-[var(--foreground)]">내용</label>
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={"안녕하세요.\n이번 주 학습자료를 안내드립니다.\n\n자료 보기: https://www.pmedu4u.com/..."}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--secondary)]">
              링크만 넣거나, 아래에서 문제지 PDF를 골라 직접 첨부할 수 있습니다.
            </p>
          </div>

          {/* 문제지 PDF 첨부(선택) */}
          <div className="rounded-xl border border-[var(--border-c)] bg-[var(--background)]/60 p-4">
            <label className="text-sm font-medium text-[var(--foreground)]">문제지 PDF 첨부 (선택)</label>
            <select
              value={worksheetId}
              onChange={(e) => pickWorksheet(e.target.value)}
              className={inputClass}
            >
              <option value="">첨부 안 함</option>
              {worksheets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                  {w.is_exam ? " (실전 시험)" : ""}
                </option>
              ))}
            </select>

            {selectedWorksheet && (
              <div className="mt-3 space-y-2">
                {selectedWorksheet.is_exam && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    ⚠ 실전 시험 문제지입니다 — 원칙상 해설은 결과 확인 후 따로 보내는 것을 권장합니다(해설 첨부 기본 꺼둠).
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                    <input type="checkbox" checked={attachProblems} onChange={(e) => setAttachProblems(e.target.checked)} />
                    문제 PDF
                  </label>
                  <button
                    type="button"
                    onClick={() => previewPdf("problems")}
                    disabled={previewing === "problems"}
                    className="text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)] disabled:opacity-50"
                  >
                    {previewing === "problems" ? "불러오는 중..." : "미리보기"}
                  </button>

                  <label className="ml-4 flex items-center gap-2 text-sm text-[var(--foreground)]">
                    <input type="checkbox" checked={attachAnswers} onChange={(e) => setAttachAnswers(e.target.checked)} />
                    해설 PDF
                  </label>
                  <button
                    type="button"
                    onClick={() => previewPdf("answers")}
                    disabled={previewing === "answers"}
                    className="text-xs text-[var(--secondary)] underline hover:text-[var(--foreground)] disabled:opacity-50"
                  >
                    {previewing === "answers" ? "불러오는 중..." : "미리보기"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && <p className="text-sm text-[var(--mint-dark)]">{result}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSend}
              disabled={sending}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
            >
              {sending ? "보내는 중..." : "보내기"}
            </button>
            <button
              onClick={handleTestToMe}
              disabled={sending}
              className="rounded-full border border-[var(--border-c)] bg-white px-6 py-3 text-sm font-medium text-[var(--foreground)] disabled:opacity-60"
            >
              나에게 테스트 보내기
            </button>
          </div>
          <p className="text-xs text-[var(--secondary)]">
            &ldquo;나에게 테스트 보내기&rdquo;는 제목·내용과 상관없이 관리자 본인 이메일
            {myEmail ? ` (${myEmail})` : ""}로 확인용 메일을 보냅니다.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
