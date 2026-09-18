"use client";

// entitlement_grants 부여·회수. RUN_MATH_SITE.md 6단계 A(3) — /admin/math-progression/grants에서
// 여기로 옮김(math-progression 폴더는 옛 설계라 통째로 삭제, 이 화면만 지금도 라이브라 유지).
// /admin/study 레이아웃 아래로 들어와서 Header/Footer는 레이아웃이 대신 그려준다.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";
import type { FeatureKey } from "@/lib/access/entitlement";

const FEATURE_KEYS: FeatureKey[] = ["math.subscription", "math.lecture"];

interface GrantRow {
  id: number;
  user_id: string;
  feature_key: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  note: string | null;
  student_name: string | null;
  student_email: string | null;
}

export default function AdminStudyGrantsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<GrantRow[]>([]);

  const [studentEmail, setStudentEmail] = useState("");
  const [featureKey, setFeatureKey] = useState<FeatureKey>("math.subscription");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("entitlement_grants")
      .select("id, user_id, feature_key, granted_at, expires_at, revoked_at, note")
      .order("granted_at", { ascending: false });
    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } =
      userIds.length > 0 ? await supabase.from("profiles").select("id, name, email").in("id", userIds) : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    setGrants(
      rows.map((r) => ({
        ...r,
        student_name: profileById.get(r.user_id)?.name ?? null,
        student_email: profileById.get(r.user_id)?.email ?? null,
      }))
    );
  }

  useEffect(() => {
    const supabase = createClient();
    async function init() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      const ok = canManageMaterials(me?.role);
      setAllowed(ok);
      if (!ok) return;
      setMeId(auth.user.id);
      await load();
      setLoading(false);
    }
    init();
  }, []);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!studentEmail.trim()) return;

    setSaving(true);
    const supabase = createClient();
    const { data: student, error: findErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", studentEmail.trim())
      .maybeSingle();
    if (findErr || !student) {
      setSaving(false);
      setError("해당 이메일의 학생을 찾을 수 없습니다.");
      return;
    }

    const { error: insErr } = await supabase.from("entitlement_grants").insert({
      user_id: student.id,
      feature_key: featureKey,
      granted_by: meId,
      note: note.trim() || null,
    });
    setSaving(false);
    if (insErr) {
      setError(`부여 실패: ${insErr.message}`);
      return;
    }
    setMessage("권한을 부여했습니다.");
    setStudentEmail("");
    setNote("");
    await load();
  }

  async function handleRevoke(grant: GrantRow) {
    if (!confirm(`${grant.student_email ?? grant.user_id}의 "${grant.feature_key}" 권한을 회수할까요?`)) return;
    const supabase = createClient();
    const { error: revErr } = await supabase
      .from("entitlement_grants")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", grant.id);
    if (revErr) {
      setError(`회수 실패: ${revErr.message}`);
      return;
    }
    await load();
  }

  if (allowed === null) return <p className="text-sm text-[var(--secondary)]">확인 중...</p>;
  if (allowed === false) return <p className="text-sm text-[var(--foreground)]">이 화면을 볼 권한이 없습니다.</p>;

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <div>
      <h1 className="text-2xl font-medium text-[var(--foreground)]">접근권 부여 (entitlement_grants)</h1>
      <p className="mt-1 text-sm text-[var(--secondary)]">
        결제 연동 전 임시 권한 부여용. math.subscription/math.lecture 실제로 판정에 쓰인다(src/lib/access/entitlement.ts).
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
      ) : (
        <>
          <form onSubmit={handleGrant} className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

            <label className="block text-sm text-[var(--foreground)]">
              학생 이메일
              <input
                type="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                placeholder="student@example.com"
                className={inputClass}
              />
            </label>

            <label className="block text-sm text-[var(--foreground)]">
              기능
              <select value={featureKey} onChange={(e) => setFeatureKey(e.target.value as FeatureKey)} className={inputClass}>
                {FEATURE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-[var(--foreground)]">
              메모(선택)
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
            </label>

            <button
              type="submit"
              disabled={saving || !studentEmail.trim()}
              className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
            >
              {saving ? "부여 중..." : "권한 부여"}
            </button>
          </form>

          <section className="mt-8">
            <h2 className="text-lg font-medium text-[var(--foreground)]">부여 내역 ({grants.length}건)</h2>
            <ul className="mt-3 space-y-2">
              {grants.map((g) => (
                <li key={g.id} className="rounded-xl border border-[var(--border-c)] bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--foreground)]">
                      {g.student_name ?? "-"} ({g.student_email ?? g.user_id}) · {g.feature_key}
                    </span>
                    {g.revoked_at ? (
                      <span className="text-xs text-[var(--secondary)]">회수됨</span>
                    ) : (
                      <button type="button" onClick={() => handleRevoke(g)} className="text-xs text-red-600 hover:underline">
                        회수
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--secondary)]">
                    부여일 {new Date(g.granted_at).toLocaleDateString()}
                    {g.note && ` · ${g.note}`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
