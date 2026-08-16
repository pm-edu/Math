// worksheets/[id] 제출 시 question_attempts 에 병행 기록한다.
// problem_submissions(문제당 1행, 재제출시 덮어씀)는 그대로 두고, 여기는 시도 이력만 쌓는다.
// 실패해도 메인 제출 흐름을 막으면 안 되므로 호출부에서 실패를 무시한다.

import { createClient } from "@/lib/supabase/client";
import type { Problem } from "@/lib/problems";

type GradedProblem = { problem: Problem; isCorrect: boolean };

export async function logQuestionAttempts(
  studentId: string,
  worksheetId: string,
  graded: GradedProblem[],
  elapsedSeconds: number
): Promise<void> {
  if (graded.length === 0) return;
  const supabase = createClient();

  // 단원 ID 조회 — problems.curriculum_group/curriculum_detail/unit 과 일치하는 curriculum_units 행을 찾는다.
  const details = Array.from(
    new Set(graded.map((g) => g.problem.curriculum_detail).filter((d): d is string => !!d))
  );
  const unitLookup = new Map<string, string>();
  if (details.length > 0) {
    const { data: units } = await supabase
      .from("curriculum_units")
      .select("id, curriculum_group, curriculum_detail, unit_name")
      .in("curriculum_detail", details);
    (units ?? []).forEach((u) => {
      unitLookup.set(`${u.curriculum_group}|${u.curriculum_detail}|${u.unit_name}`, u.id);
    });
  }

  // 이 학생이 각 문제를 몇 번째 시도하는지(문제당 히스토리 개수 + 1)
  const problemIds = graded.map((g) => g.problem.id);
  const { data: prior } = await supabase
    .from("question_attempts")
    .select("problem_id")
    .eq("student_id", studentId)
    .in("problem_id", problemIds);
  const priorCount = new Map<string, number>();
  (prior ?? []).forEach((row) => {
    priorCount.set(row.problem_id, (priorCount.get(row.problem_id) ?? 0) + 1);
  });

  const rows = graded.map(({ problem, isCorrect }) => ({
    student_id: studentId,
    problem_id: problem.id,
    unit_id:
      problem.curriculum_group && problem.curriculum_detail && problem.unit
        ? (unitLookup.get(`${problem.curriculum_group}|${problem.curriculum_detail}|${problem.unit}`) ?? null)
        : null,
    difficulty: problem.difficulty,
    attempt_no: (priorCount.get(problem.id) ?? 0) + 1,
    is_correct: isCorrect,
    elapsed_seconds: elapsedSeconds,
    source: "worksheet",
    source_id: worksheetId,
  }));

  await supabase.from("question_attempts").insert(rows);
}
