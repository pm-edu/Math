"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { MathText } from "@/components/ProblemBody";
import { canManageMaterials } from "@/lib/roles";
import { useSubject } from "@/lib/subject";
import { DIFFICULTIES, FORMATS } from "@/lib/problems";
import type { Category } from "@/lib/categories";
import { CURRICULUM_GROUPS, CURRICULUM_DETAILS, type CurriculumGroup } from "@/lib/curriculum";

type Draft = {
  content_text: string;
  answer: string;
  unit: string;
  difficulty: string;
  problem_format: string;
  include: boolean;
};

export default function AdminExtractPage() {
  const router = useRouter();
  const { subject } = useSubject();
  const isMath = subject === "math";
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [courseLevel, setCourseLevel] = useState("");
  const [curriculumGroup, setCurriculumGroup] = useState<CurriculumGroup>("KR");
  const [curriculumDetail, setCurriculumDetail] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
      if (!canManageMaterials(me?.role)) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name, name_en, position")
        .order("position");
      const list = (cats ?? []) as Category[];
      setCategories(list);
      if (list[0]) setCategory(list[0].name);
    }
    init();
  }, [router]);

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // "data:...;base64," 뒷부분만
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function handleExtract() {
    setError(null);
    setMessage(null);
    if (!file) {
      setError("파일을 선택해주세요.");
      return;
    }
    setExtracting(true);
    setDrafts([]);

    try {
      const base64 = await fileToBase64(file);
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const res = await fetch("/api/extract-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type }),
      });
      const data = await res.json();
      setExtracting(false);

      if (!res.ok || !data.ok) {
        setError(data.message ?? "추출에 실패했습니다.");
        return;
      }

      const list: Draft[] = (data.problems ?? []).map(
        (p: Partial<Draft>) => ({
          content_text: p.content_text ?? "",
          answer: p.answer ?? "",
          unit: p.unit ?? "",
          difficulty: DIFFICULTIES.includes(p.difficulty as (typeof DIFFICULTIES)[number])
            ? (p.difficulty as string)
            : "중",
          problem_format: FORMATS.includes(p.problem_format as (typeof FORMATS)[number])
            ? (p.problem_format as string)
            : "",
          include: true,
        })
      );
      setDrafts(list);
      if (list.length === 0) setMessage("추출된 문제가 없습니다. 다른 파일로 시도해보세요.");
      else setMessage(`${list.length}개 문제를 읽었습니다. 확인·수정 후 저장하세요.`);
    } catch {
      setExtracting(false);
      setError("파일을 읽지 못했습니다.");
    }
  }

  function updateDraft(i: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  async function handleSave() {
    setError(null);
    setMessage(null);
    const chosen = drafts.filter((d) => d.include && d.content_text.trim());
    if (chosen.length === 0) {
      setError("저장할 문제가 없습니다.");
      return;
    }
    if (isMath && !curriculumDetail) {
      setError("세부 과정을 선택해주세요.");
      return;
    }
    setSaving(true);

    // 관리자가 방금 검토했으므로 verified=true 로 저장한다.
    // image_url 은 없이 텍스트 기반 문제로 저장.
    const rows = chosen.map((d) => ({
      subject,
      category: isMath ? null : category,
      course_level: isMath ? null : courseLevel.trim() || null,
      curriculum_group: isMath ? curriculumGroup : null,
      curriculum_detail: isMath ? curriculumDetail : null,
      unit: d.unit.trim() || null,
      difficulty: d.difficulty,
      problem_format: d.problem_format || null,
      answer: d.answer.trim() || null,
      content_text: d.content_text.trim(),
      image_url: "", // 텍스트 문제라 이미지 없음
      problem_type: "text",
      source: "ai",
      verified: true,
    }));

    const { error } = await createClient().from("problems").insert(rows);
    setSaving(false);

    if (error) {
      setError(`저장 실패: ${error.message}`);
      return;
    }
    setMessage(`${rows.length}개 문제를 문제은행에 저장했습니다.`);
    setDrafts([]);
    setFile(null);
  }

  if (allowed === null)
    return (
      <Shell>
        <p className="text-sm text-[var(--secondary)]">확인 중...</p>
      </Shell>
    );
  if (allowed === false)
    return (
      <Shell>
        <h1 className="text-2xl font-medium text-[var(--foreground)]">접근 권한이 없습니다</h1>
        <Link
          href="/mypage"
          className="mt-8 inline-block rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)]"
        >
          마이페이지로
        </Link>
      </Shell>
    );

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/admin/problems"
          className="text-sm text-[var(--secondary)] underline hover:text-[var(--foreground)]"
        >
          ← 문제은행으로
        </Link>
        <h1 className="mt-4 text-3xl font-medium text-[var(--foreground)]">PDF·이미지에서 문제 추출</h1>
        <p className="mt-2 text-[var(--secondary)]">
          문제지 파일을 올리면 AI가 문제를 하나씩 읽어옵니다. 확인·수정 후 저장하세요.
          <br />
          정답이 틀릴 수 있으니 저장 전 꼭 검토해 주세요.
        </p>

        <div className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          {isMath ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-[var(--foreground)]">커리큘럼</label>
                <select
                  value={curriculumGroup}
                  onChange={(e) => { setCurriculumGroup(e.target.value as CurriculumGroup); setCurriculumDetail(""); }}
                  className={inputClass}
                >
                  {CURRICULUM_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--foreground)]">세부 과정</label>
                <select value={curriculumDetail} onChange={(e) => setCurriculumDetail(e.target.value)} className={inputClass}>
                  <option value="">(선택)</option>
                  {CURRICULUM_DETAILS[curriculumGroup].map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-[var(--foreground)]">분류</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-[var(--foreground)]">과정 (선택)</label>
                <input
                  type="text"
                  value={courseLevel}
                  onChange={(e) => setCourseLevel(e.target.value)}
                  placeholder="고2 미적분"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm text-[var(--foreground)]">문제지 파일 (이미지 또는 PDF)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--secondary)]">
              한 번에 한 장(또는 짧은 PDF)을 권장합니다. 크면 시간이 오래 걸립니다.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

          <button
            onClick={handleExtract}
            disabled={extracting}
            className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
          >
            {extracting ? "읽는 중... (수십 초 걸릴 수 있어요)" : "문제 읽어오기"}
          </button>
        </div>

        {drafts.length > 0 && (
          <>
            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[var(--foreground)]">
                읽어온 문제 {drafts.length}개
              </h2>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[var(--mint)] px-6 py-2.5 text-sm font-medium text-[var(--mint-dark)] disabled:opacity-60"
              >
                {saving ? "저장 중..." : "선택 문제 저장"}
              </button>
            </div>

            <ul className="mt-4 space-y-4">
              {drafts.map((d, i) => (
                <li
                  key={i}
                  className={`rounded-2xl border bg-white p-5 ${
                    d.include ? "border-[var(--border-c)]" : "border-[var(--border-c)] opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--secondary)]">{i + 1}번</span>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--secondary)]">
                      <input
                        type="checkbox"
                        checked={d.include}
                        onChange={(e) => updateDraft(i, { include: e.target.checked })}
                      />
                      저장 포함
                    </label>
                  </div>

                  <textarea
                    rows={3}
                    value={d.content_text}
                    onChange={(e) => updateDraft(i, { content_text: e.target.value })}
                    className={inputClass}
                    placeholder="문제 본문"
                  />

                  {d.content_text.trim() && (
                    <div className="mt-2 rounded-lg border border-dashed border-[var(--border-c)] bg-[var(--pink-light)]/20 p-3">
                      <p className="mb-1 text-xs text-[var(--secondary)]">학생 화면 미리보기</p>
                      <MathText
                        text={d.content_text}
                        className="text-[15px] leading-relaxed text-[var(--foreground)]"
                      />
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <input
                      type="text"
                      value={d.answer}
                      onChange={(e) => updateDraft(i, { answer: e.target.value })}
                      placeholder="정답"
                      className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                    />
                    <input
                      type="text"
                      value={d.unit}
                      onChange={(e) => updateDraft(i, { unit: e.target.value })}
                      placeholder="단원"
                      className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                    />
                    <select
                      value={d.difficulty}
                      onChange={(e) => updateDraft(i, { difficulty: e.target.value })}
                      className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm"
                    >
                      {DIFFICULTIES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                    <select
                      value={d.problem_format}
                      onChange={(e) => updateDraft(i, { problem_format: e.target.value })}
                      className="rounded-lg border border-[var(--border-c)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="">유형</option>
                      {FORMATS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-24 text-center">{children}</main>
      <Footer />
    </>
  );
}
