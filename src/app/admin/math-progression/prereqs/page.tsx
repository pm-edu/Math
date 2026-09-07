"use client";

// 수학 학습 진행 구조 PG7: 선수관계 편집 (RUN_MATH_PROGRESSION.md PG7 7-1/7-2).
// 저장 전에 사이클을 검사한다 — DB 트리거(math_unit_prereqs_cycle_guard, PG0)와 이중 방어.
// 여기서 하는 JS 검사는 사용자 경험용(즉시 피드백)일 뿐, 최종 방어선은 여전히 DB 트리거다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase/client";
import { canManageMaterials } from "@/lib/roles";

const CURRICULUM_DETAIL = "IGCSE_0607"; // D-PG-1과 동일 제약 — 지금 실제로 진행 스키마가 도는 유일한 커리큘럼

interface Unit {
  id: string;
  unit_name: string;
  sort_order: number;
}

interface Edge {
  unit_id: string;
  requires_unit_id: string;
}

export default function MathPrereqsAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [unitId, setUnitId] = useState("");
  const [requiresUnitId, setRequiresUnitId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      await load();
      setLoading(false);
    }
    init();
  }, [router]);

  async function load() {
    const supabase = createClient();
    const { data: unitRows } = await supabase
      .from("curriculum_units")
      .select("id, unit_name, sort_order")
      .eq("curriculum_detail", CURRICULUM_DETAIL)
      .not("unit_name", "ilike", "%코스워크%")
      .order("sort_order");
    const { data: edgeRows } = await supabase.from("math_unit_prereqs").select("unit_id, requires_unit_id");
    setUnits((unitRows ?? []) as Unit[]);
    setEdges((edgeRows ?? []) as Edge[]);
  }

  const unitNameById = new Map(units.map((u) => [u.id, u.unit_name]));

  // DB 트리거와 같은 논리(reachability) — unit_id(A)가 requires_unit_id(B)를 요구하게
  // 만들기 전에, B에서 기존 edge를 따라가 A에 이미 도달할 수 있는지 확인한다.
  function wouldCreateCycle(newUnitId: string, newRequiresId: string, currentEdges: Edge[]): boolean {
    const visited = new Set<string>();
    const queue = [newRequiresId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === newUnitId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of currentEdges) {
        if (e.unit_id === current) queue.push(e.requires_unit_id);
      }
    }
    return false;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!unitId || !requiresUnitId) return;
    if (unitId === requiresUnitId) {
      setError("같은 단원을 선수로 지정할 수 없습니다.");
      return;
    }
    if (wouldCreateCycle(unitId, requiresUnitId, edges)) {
      setError("이 선수관계를 추가하면 순환 참조가 생깁니다.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: insErr } = await supabase.from("math_unit_prereqs").insert({ unit_id: unitId, requires_unit_id: requiresUnitId });
    setSaving(false);
    if (insErr) {
      // JS 사전 검사를 통과했어도 DB 트리거가 최종적으로 다시 막을 수 있다(이중 방어) —
      // 그 경우 트리거의 예외 메시지를 그대로 보여준다.
      setError(`저장 실패: ${insErr.message}`);
      return;
    }
    setMessage("선수관계를 추가했습니다.");
    setUnitId("");
    setRequiresUnitId("");
    await load();
  }

  async function handleDelete(edge: Edge) {
    if (!confirm(`"${unitNameById.get(edge.unit_id)}" → "${unitNameById.get(edge.requires_unit_id)}" 선수관계를 삭제할까요?`)) return;
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("math_unit_prereqs")
      .delete()
      .eq("unit_id", edge.unit_id)
      .eq("requires_unit_id", edge.requires_unit_id);
    if (delErr) {
      setError(`삭제 실패: ${delErr.message}`);
      return;
    }
    await load();
  }

  if (allowed === null) {
    return (
      <Shell>
        <p className="text-sm text-[var(--secondary)]">확인 중...</p>
      </Shell>
    );
  }
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

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-[var(--border-c)] bg-white px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <Link href="/admin/math-progression" className="text-sm text-[var(--secondary)] hover:text-[var(--foreground)]">
          ← 수학 학습 진행 관리
        </Link>
        <h1 className="mt-2 text-2xl font-medium text-[var(--foreground)]">선수관계 편집</h1>
        <p className="mt-1 text-sm text-[var(--secondary)]">
          &ldquo;A가 B를 선수로 요구&rdquo; = A를 하려면 B를 먼저 마스터해야 함. 커리큘럼: {CURRICULUM_DETAIL}
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--secondary)]">불러오는 중...</p>
        ) : (
          <>
            <form onSubmit={handleAdd} className="mt-8 space-y-4 rounded-2xl border border-[var(--border-c)] bg-white p-6">
              {error && <p className="text-sm text-red-600">{error}</p>}
              {message && <p className="text-sm text-[var(--mint-dark)]">{message}</p>}

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-sm text-[var(--foreground)]">
                  이 단원은
                  <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
                    <option value="">선택</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[var(--foreground)]">
                  이 단원을 선수로 요구
                  <select value={requiresUnitId} onChange={(e) => setRequiresUnitId(e.target.value)} className={inputClass}>
                    <option value="">선택</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={saving || !unitId || !requiresUnitId}
                className="rounded-full bg-[var(--pink)] px-6 py-3 text-sm font-medium text-[var(--pink-dark)] disabled:opacity-60"
              >
                {saving ? "추가 중..." : "선수관계 추가"}
              </button>
            </form>

            <section className="mt-8">
              <h2 className="text-lg font-medium text-[var(--foreground)]">현재 선수관계 ({edges.length}개)</h2>
              <ul className="mt-3 space-y-2">
                {edges.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-c)] bg-white px-4 py-3 text-sm"
                  >
                    <span className="text-[var(--foreground)]">
                      {unitNameById.get(e.unit_id) ?? e.unit_id} ← {unitNameById.get(e.requires_unit_id) ?? e.requires_unit_id}
                    </span>
                    <button type="button" onClick={() => handleDelete(e)} className="text-xs text-red-600 hover:underline">
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            </section>
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
