// 출결 일괄체크 화면용 데이터 접근 함수.

import { createClient } from "@/lib/supabase/client";

export type AttendanceStatus =
  | "present"
  | "late"
  | "early_leave"
  | "absent_excused"
  | "absent_unexcused"
  | "makeup";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "출석",
  late: "지각",
  early_leave: "조퇴",
  absent_excused: "결석(사유O)",
  absent_unexcused: "결석(무단)",
  makeup: "보강",
};

export type AttendanceRow = {
  student_id: string;
  status: AttendanceStatus;
  late_minutes: number;
  reason: string;
};

/** 그 반의 오늘(또는 지정 날짜) 수업 회차를 찾고, 없으면 만든다. */
export async function getOrCreateSession(
  classId: string,
  sessionDate: string,
  teacherId: string | null
): Promise<{ id: string | null; error: string | null }> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("class_id", classId)
    .eq("session_date", sessionDate)
    .maybeSingle();

  if (existing) return { id: existing.id, error: null };

  const { data, error } = await supabase
    .from("class_sessions")
    .insert({ class_id: classId, session_date: sessionDate, teacher_id: teacherId })
    .select("id")
    .single();

  if (error || !data) return { id: null, error: error?.message ?? "수업 회차를 만들지 못했습니다." };

  // 새 회차를 만들면 그 반의 반원 전체를 참석 대상으로 자동 채운다(RUN_MATH_SITE.md 3-2) —
  // 기존 "수동으로 추가/삭제" 기능(class_session_students 직접 편집)은 그대로 둔다, 이건 그냥
  // 새 회차의 기본값을 채우는 것뿐이라 중복 삽입이어도 안전하게 무시된다.
  const { data: classmates } = await supabase.from("profiles").select("id").eq("class_id", classId);
  if (classmates && classmates.length > 0) {
    await supabase
      .from("class_session_students")
      .upsert(
        classmates.map((s) => ({ class_session_id: data.id, student_id: s.id })),
        { onConflict: "class_session_id,student_id", ignoreDuplicates: true }
      );
  }

  return { id: data.id, error: null };
}

export async function loadAttendance(sessionId: string): Promise<Map<string, AttendanceRow>> {
  const { data } = await createClient()
    .from("attendance")
    .select("student_id, status, late_minutes, reason")
    .eq("class_session_id", sessionId);

  const map = new Map<string, AttendanceRow>();
  (data ?? []).forEach((row) => {
    map.set(row.student_id, {
      student_id: row.student_id,
      status: row.status as AttendanceStatus,
      late_minutes: row.late_minutes ?? 0,
      reason: row.reason ?? "",
    });
  });
  return map;
}

export async function saveAttendance(
  sessionId: string,
  recordedBy: string,
  rows: AttendanceRow[]
): Promise<{ error: string | null }> {
  const payload = rows.map((r) => ({
    student_id: r.student_id,
    class_session_id: sessionId,
    status: r.status,
    late_minutes: r.status === "late" ? r.late_minutes || 0 : 0,
    reason: r.reason || null,
    recorded_by: recordedBy,
  }));

  const { error } = await createClient()
    .from("attendance")
    .upsert(payload, { onConflict: "student_id,class_session_id" });

  return { error: error?.message ?? null };
}
