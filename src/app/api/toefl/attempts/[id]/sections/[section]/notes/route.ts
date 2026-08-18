import { z } from "zod";
import { jsonError, requireToeflUser } from "@/lib/toefl/server/auth";

// Listening 노트테이킹 패널 읽기/저장. 일부러 GET /current(전 영역 공유·핵심 응시 경로)에
// notes를 안 끼워넣고 이렇게 별도 라우트로 뺐다 — notes 컬럼은 새 마이그레이션
// (202608181300)이 필요한데, 혹시 아직 안 돌린 상태에서 select에 없는 컬럼을 넣으면 그
// select 자체가 에러가 나서 current 라우트 전체(4개 영역 전부의 새로고침 복구)가 깨진다.
// 노트는 채점 대상도 아니고 있으면 좋은 부가기능이라, 실패해도 시험 진행에 전혀 영향이
// 없도록 완전히 분리해뒀다.

const bodySchema = z.object({ notes: z.string().max(5000) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string; section: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId, section } = await params;
  const { client } = auth;

  const { data: attempt } = await client.from("toefl_attempt").select("id, user_id").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");

  const { data, error } = await client
    .from("toefl_section_attempt")
    .select("notes")
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .maybeSingle();

  if (error) return Response.json({ ok: true, notes: "" }); // notes 컬럼 마이그레이션 전이어도 조용히 빈 값
  return Response.json({ ok: true, notes: data?.notes ?? "" });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; section: string }> }) {
  const auth = await requireToeflUser(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { id: attemptId, section } = await params;
  const { client } = auth;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "요청 형식이 올바르지 않습니다.");

  const { data: attempt } = await client.from("toefl_attempt").select("id, user_id").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== auth.userId) return jsonError(404, "시험 응시 기록을 찾을 수 없습니다.");

  const { error } = await client
    .from("toefl_section_attempt")
    .update({ notes: parsed.data.notes })
    .eq("attempt_id", attemptId)
    .eq("section", section)
    .is("finished_at", null);
  // 저장 실패(마이그레이션 전 등)해도 시험 진행을 막을 정도로 중요하지 않다 — 조용히 무시한다
  // (§12 "채점 실패가 리포트 전체를 막지 않는다"와 같은 원칙).
  if (error) return Response.json({ ok: true, saved: false });

  return Response.json({ ok: true, saved: true });
}
