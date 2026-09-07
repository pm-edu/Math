import { createServiceClient } from "@/lib/supabase/service";

// 학부모용 읽기 전용 리포트. 로그인 없이 토큰으로만 접근한다(30일 만료).
// 리스크 점수·다른 학생과의 비교는 절대 포함하지 않는다(docs/student-management.md §4 요구사항).

type Comment = { at: string; body: string };

async function loadReport(token: string) {
  const supabase = createServiceClient();

  const { data: tokenRow } = await supabase
    .from("parent_report_tokens")
    .select("student_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  // 3차 화면 검토(2026-08-27) [C]-8: "만료"와 "애초에 존재하지 않는 토큰"을 구분해 알려준다 —
  // 전엔 둘 다 null 하나로 뭉뚱그려서 "만료됐습니다" 문구를 못 붙였다.
  if (!tokenRow) return { status: "not_found" as const };
  if (new Date(tokenRow.expires_at) < new Date()) return { status: "expired" as const };

  const studentId = tokenRow.student_id;

  const [
    { data: profile },
    { data: core },
    { data: exams },
    { data: attendanceRows },
    { data: consultations },
    { data: notes },
    { data: mathUnitProgress },
    { data: mathWeakRows },
    { data: mathAttempts },
  ] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", studentId).maybeSingle(),
    supabase.from("v_student_core").select("attendance_rate, submission_rate, first_try_accuracy, growth_delta").eq("student_id", studentId).maybeSingle(),
    supabase.from("v_student_exams").select("title, exam_date, percentage, grade_label").eq("student_id", studentId).order("exam_date"),
    supabase.from("attendance").select("status").eq("student_id", studentId),
    supabase.from("consultations").select("held_at, summary").eq("student_id", studentId).eq("visible_to_parent", true).order("held_at", { ascending: false }),
    supabase.from("student_notes").select("created_at, next_plan, stuck_point").eq("student_id", studentId).eq("share_with_parent", true).order("created_at", { ascending: false }),
    // 수학 학습 진행 구조 PG6 6-2 — parent_report_tokens/이 페이지를 그대로 재사용, 새 토큰
    // 체계를 만들지 않는다(지시서 명시). 뷰는 202609071600_math_progression_views.sql 참고.
    supabase.from("v_math_unit_progress").select("status").eq("user_id", studentId),
    supabase.from("v_math_weakness").select("unit_id, accuracy_pct, weakness_score").eq("user_id", studentId).order("weakness_score", { ascending: false }).limit(3),
    supabase
      .from("question_attempts")
      .select("is_correct, created_at, math_sessions(kind)")
      .eq("student_id", studentId)
      .eq("source", "self")
      .gte("created_at", new Date(Date.now() - 28 * 86_400_000).toISOString()),
  ]);

  const attendanceCounts = { present: 0, late: 0, early_leave: 0, absent_excused: 0, absent_unexcused: 0, makeup: 0 } as Record<string, number>;
  (attendanceRows ?? []).forEach((r) => {
    attendanceCounts[r.status] = (attendanceCounts[r.status] ?? 0) + 1;
  });

  const comments: Comment[] = [
    ...(consultations ?? []).map((c) => ({ at: c.held_at, body: c.summary })),
    ...(notes ?? [])
      .filter((n) => n.next_plan || n.stuck_point)
      .map((n) => ({ at: n.created_at, body: [n.stuck_point && `막힌 부분: ${n.stuck_point}`, n.next_plan && `다음 계획: ${n.next_plan}`].filter(Boolean).join(" · ") })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // 수학 진행 섹션 — mastered unit 수, 최근 4주 정답률 추이, 약점 3개(v_math_weakness).
  const mathMasteredCount = (mathUnitProgress ?? []).filter((r) => r.status === "mastered").length;
  const hasMathData = (mathUnitProgress ?? []).length > 0;

  const weakUnitIds = (mathWeakRows ?? []).map((r) => r.unit_id);
  const { data: weakUnitNames } =
    weakUnitIds.length > 0
      ? await supabase.from("curriculum_units").select("id, unit_name").in("id", weakUnitIds)
      : { data: [] as { id: string; unit_name: string }[] };
  const unitNameById = new Map((weakUnitNames ?? []).map((u) => [u.id, u.unit_name]));
  const mathWeakUnits = (mathWeakRows ?? []).map((r) => ({
    unitName: unitNameById.get(r.unit_id) ?? "-",
    accuracyPct: Math.round(r.accuracy_pct),
  }));

  // "진단(diagnostic)은 능력 통계에서 제외" 원칙(PG-A/PG1)을 이 리포트의 직접 쿼리에도 동일 적용.
  type AttemptRow = { is_correct: boolean; created_at: string; math_sessions: { kind: string } | null };
  const selfAttempts = ((mathAttempts ?? []) as unknown as AttemptRow[]).filter((r) => r.math_sessions?.kind !== "diagnostic");
  const WEEK_MS = 7 * 86_400_000;
  const now = Date.now();
  const mathAccuracyTrend = Array.from({ length: 4 }, (_, i) => {
    const weekStart = now - (4 - i) * WEEK_MS;
    const weekEnd = now - (3 - i) * WEEK_MS;
    const weekAttempts = selfAttempts.filter((a) => {
      const t = new Date(a.created_at).getTime();
      return t >= weekStart && t < weekEnd;
    });
    const accuracy =
      weekAttempts.length > 0 ? Math.round((weekAttempts.filter((a) => a.is_correct).length / weekAttempts.length) * 100) : null;
    return { weekLabel: `${4 - i}주 전`, accuracy, attempts: weekAttempts.length };
  });

  return {
    status: "ok" as const,
    studentName: profile?.name ?? "학생",
    attendanceRate: core?.attendance_rate ?? null,
    submissionRate: core?.submission_rate ?? null,
    firstTryAccuracy: core?.first_try_accuracy ?? null,
    growthDelta: core?.growth_delta ?? null,
    attendanceCounts,
    exams: (exams ?? []) as { title: string; exam_date: string; percentage: number | null; grade_label: string | null }[],
    comments,
    hasMathData,
    mathMasteredCount,
    mathWeakUnits,
    mathAccuracyTrend,
  };
}

export default async function ParentReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await loadReport(token);

  if (report.status === "expired") {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">링크가 만료되었습니다</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">담당 강사에게 새 링크를 요청하세요.</p>
      </main>
    );
  }

  if (report.status === "not_found") {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-medium text-[var(--foreground)]">링크가 유효하지 않습니다</h1>
        <p className="mt-3 text-sm text-[var(--secondary)]">담당 강사에게 새 링크를 요청하세요.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-medium text-[var(--foreground)]">{report.studentName} 학습 리포트</h1>
      <p className="mt-1 text-sm text-[var(--secondary)]">최근 28일 기준</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
          <p className="text-xs text-[var(--secondary)]">출석률</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            {report.attendanceRate != null ? `${report.attendanceRate}%` : "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
          <p className="text-xs text-[var(--secondary)]">과제 제출률</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            {report.submissionRate != null ? `${report.submissionRate}%` : "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
          <p className="text-xs text-[var(--secondary)]">최초시도 정답률</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            {report.firstTryAccuracy != null ? `${report.firstTryAccuracy}%` : "-"}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-c)] bg-white p-4">
          <p className="text-xs text-[var(--secondary)]">정답률 변화</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            {report.growthDelta != null ? `${report.growthDelta > 0 ? "+" : ""}${report.growthDelta}%p` : "-"}
          </p>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-[var(--border-c)] bg-white p-6">
        <h2 className="text-lg font-medium text-[var(--foreground)]">출결 현황</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--secondary)]">
          <span>출석 {report.attendanceCounts.present}회</span>
          <span>지각 {report.attendanceCounts.late}회</span>
          <span>결석(사유) {report.attendanceCounts.absent_excused}회</span>
          <span>결석(무단) {report.attendanceCounts.absent_unexcused}회</span>
          <span>보강 {report.attendanceCounts.makeup}회</span>
        </div>
      </section>

      {report.exams.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--foreground)]">성적 추이</h2>
          <ul className="mt-3 space-y-2">
            {report.exams.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-[var(--foreground)]">
                  {e.title} · {new Date(e.exam_date).toLocaleDateString("ko-KR")}
                </span>
                <span className="text-[var(--secondary)]">
                  {e.percentage != null ? `${e.percentage}%` : "-"}
                  {e.grade_label && ` · ${e.grade_label}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.hasMathData && (
        <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--foreground)]">수학 진행</h2>
          <p className="mt-3 text-sm text-[var(--foreground)]">
            숙달한 단원 <span className="font-semibold">{report.mathMasteredCount}개</span>
          </p>

          <p className="mt-4 text-xs text-[var(--secondary)]">최근 4주 정답률 추이</p>
          <div className="mt-2 flex gap-3">
            {report.mathAccuracyTrend.map((w, i) => (
              <div key={i} className="flex-1 rounded-lg border border-[var(--border-c)] p-3 text-center">
                <p className="text-xs text-[var(--secondary)]">{w.weekLabel}</p>
                <p className="mt-1 text-lg font-medium text-[var(--foreground)]">{w.accuracy != null ? `${w.accuracy}%` : "-"}</p>
              </div>
            ))}
          </div>

          {report.mathWeakUnits.length > 0 && (
            <>
              <p className="mt-4 text-xs text-[var(--secondary)]">보완이 필요한 단원</p>
              <ul className="mt-2 space-y-1">
                {report.mathWeakUnits.map((u, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground)]">{u.unitName}</span>
                    <span className="text-[var(--secondary)]">{u.accuracyPct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {report.comments.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--border-c)] bg-white p-6">
          <h2 className="text-lg font-medium text-[var(--foreground)]">선생님 코멘트</h2>
          <ul className="mt-3 space-y-3">
            {report.comments.map((c, i) => (
              <li key={i} className="text-sm">
                <p className="text-xs text-[var(--secondary)]">{new Date(c.at).toLocaleDateString("ko-KR")}</p>
                <p className="mt-1 text-[var(--foreground)]">{c.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
