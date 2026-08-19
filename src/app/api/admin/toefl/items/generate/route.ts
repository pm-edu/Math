import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { callGemini } from "@/lib/gemini-server";
import { buildGenerationPrompt, parseGeneratedJson, taskTypeConfig } from "@/lib/toefl/server/item-generation";

// TOEFL P6: 관리자가 Reading/Listening 문항 초안을 AI로 생성한다(/admin/sat와 같은 흐름).
// 저장은 하지 않는다 — 관리자가 화면에서 검수·수정 후 /api/admin/toefl/items/bulk로 직접 저장한다.
// 한 번에 많이 만들 수 있도록 개수 상한을 넉넉히 두고(§ below), Gemini 응답이 길어질 수 있어
// 서버리스 기본 실행시간 제한을 넘지 않게 maxDuration을 늘려둔다.

export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);

  const body = (await req.json().catch(() => ({}))) as {
    taskType?: string;
    itemsPerUnit?: number;
    topic?: string;
    difficulty?: number;
  };

  const config = taskTypeConfig(body.taskType ?? "");
  if (!config) return jsonError(400, "지원하지 않는 문항 유형입니다.");

  const itemsPerUnit = Math.min(Math.max(Math.round(body.itemsPerUnit ?? 3), 1), config.needsStimulus ? 10 : 20);
  const difficulty = Math.min(Math.max(Math.round(body.difficulty ?? 3), 1), 5);

  const prompt = buildGenerationPrompt(config.value, { itemsPerUnit, topic: body.topic, difficulty });
  const geminiRes = await callGemini([{ text: prompt }], { temperature: 0.8, json: true });
  if (!geminiRes.ok) return jsonError(502, `생성 실패: ${geminiRes.message}`);

  const parsed = parseGeneratedJson(config.value, geminiRes.text);
  if (!parsed.ok) return jsonError(502, parsed.message);

  return Response.json({ ok: true, result: parsed.result });
}
