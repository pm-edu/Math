import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, requireToeflStaff } from "@/lib/toefl/server/auth";
import { generateSpeechWav } from "@/lib/toefl/server/tts";
import { getGenerator } from "@/lib/toefl/server/generators/registry";

// TOEFL P6: 검수를 마친 문항 초안을 실제 DB에 저장한다(spec §9 POST /api/admin/toefl/items/bulk).
// 지문(stimulus)이 필요한 유형은 stimulus 1개 + item N개를 한 번에 저장한다.
// Listening 계열(오디오 필요)은 저장 직후 Gemini TTS로 실제 음성까지 만들어 채운다(P2 오디오 파이프라인 재사용).
// choose_a_response의 "말하는 문장"(spoken_text)은 음성 생성에만 쓰고 payload에는 저장하지 않는다
// (toefl_item_public 뷰로 학생에게 그대로 노출되면 듣기 전에 대본을 읽는 셈이라 §5 보안 요구사항 위반).

type IncomingOption = { id: string; text: string };
type IncomingBlank = { id: string; masked: string; length: number; answer: string };

type IncomingItem = {
  // complete_the_words
  paragraph?: string;
  blanks?: IncomingBlank[];
  // choose_a_response
  spoken_text?: string;
  // mcq_passage
  prompt?: string;
  // shared (choose_a_response, mcq_passage)
  options?: IncomingOption[];
  correct?: string[];
  // shared
  explanation_ko: string;
  skill_tags?: string[];
};

type RequestBody = {
  moduleId?: string;
  taskType?: string;
  difficulty?: number;
  stimulus?: { title?: string; text?: string } | null;
  items?: IncomingItem[];
};

type LogEntry = { kind: "stimulus" | "item"; status: "created" | "error"; message: string };

export async function POST(req: Request) {
  const auth = await requireToeflStaff(req);
  if (!auth.ok) return jsonError(auth.status, auth.message);
  const { client } = auth;

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  // 유형별 저장 형태(payload·answer_key·채점방식)는 생성기가 안다 — 여기서 분기하지 않는다.
  const generator = getGenerator(body.taskType ?? "");
  if (!generator) return jsonError(400, "지원하지 않는 문항 유형입니다.");
  if (!body.moduleId) return jsonError(400, "대상 모듈을 선택해주세요.");

  const items = (body.items ?? []).filter(Boolean);
  if (items.length === 0) return jsonError(400, "저장할 문항이 없습니다.");

  const difficulty = Math.min(Math.max(Math.round(body.difficulty ?? 3), 1), 5);

  const { data: moduleRow, error: moduleErr } = await client
    .from("toefl_module")
    .select("id, section")
    .eq("id", body.moduleId)
    .maybeSingle();
  if (moduleErr || !moduleRow) return jsonError(404, "모듈을 찾을 수 없습니다.");
  if (moduleRow.section !== generator.section) {
    return jsonError(400, `이 유형(${generator.taskType})은 ${generator.section} 모듈에만 등록할 수 있습니다.`);
  }

  const log: LogEntry[] = [];

  let stimulusId: string | null = null;
  if (generator.needsStimulus) {
    const text = (body.stimulus?.text ?? "").trim();
    if (!text) return jsonError(400, "지문/스크립트 내용이 비어 있습니다.");
    const title = (body.stimulus?.title ?? "").trim() || null;

    const { data: maxStim } = await client
      .from("toefl_stimulus")
      .select("position")
      .eq("module_id", body.moduleId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextStimPosition = (maxStim?.position ?? 0) + 1;

    const isListening = generator.section === "listening";
    const { data: stimRow, error: stimErr } = await client
      .from("toefl_stimulus")
      .insert({
        module_id: body.moduleId,
        task_type: generator.taskType,
        title,
        body: isListening ? null : text,
        transcript: isListening ? text : null,
        position: nextStimPosition,
      })
      .select("id")
      .single();
    if (stimErr || !stimRow) return jsonError(500, `지문 저장 실패: ${stimErr?.message ?? "알 수 없는 오류"}`);
    stimulusId = stimRow.id as string;
    log.push({ kind: "stimulus", status: "created", message: title ?? "(제목 없음)" });

    if (isListening) {
      const path = `admin/stimulus-${stimulusId}.wav`;
      const audioResult = await generateAndUpload(client, text, path);
      if (audioResult.ok) {
        await client
          .from("toefl_stimulus")
          .update({ audio_path: path, audio_duration_sec: Math.round(audioResult.durationSec) })
          .eq("id", stimulusId);
      } else {
        log.push({ kind: "stimulus", status: "error", message: `음성 생성 실패(나중에 다시 시도 필요): ${audioResult.message}` });
      }
    }
  }

  const { data: maxItem } = await client
    .from("toefl_item")
    .select("position")
    .eq("module_id", body.moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextPosition = (maxItem?.position ?? 0) + 1;

  const itemIds: string[] = [];
  for (const raw of items) {
    const explanation = (raw.explanation_ko ?? "").trim();
    if (!explanation) {
      log.push({ kind: "item", status: "error", message: "해설이 비어 있어 건너뛰었습니다." });
      continue;
    }

    const row = generator.toItemRow({ ...raw, skill_tags: raw.skill_tags ?? [] });
    if (!row.ok) {
      log.push({ kind: "item", status: "error", message: row.message });
      continue;
    }
    const { prompt, payload, answerKey } = row;
    const spokenTextForAudio = row.spokenText;

    const { data: itemRow, error: itemErr } = await client
      .from("toefl_item")
      .insert({
        module_id: body.moduleId,
        stimulus_id: stimulusId,
        task_type: generator.taskType,
        position: nextPosition,
        difficulty,
        scoring_mode: generator.scoringMode,
        prompt,
        payload,
        answer_key: answerKey,
        explanation_ko: explanation,
        skill_tags: (raw.skill_tags ?? []).filter(Boolean),
        // 이 라우트는 "관리자가 화면에서 검토를 마치고 저장" 하는 지점이라 검수 완료로 넣는다.
        // (마이그레이션 202608191600 로 toefl_item.verified 가 생겼고, 기본값은 false다 —
        //  여기서 true를 넣지 않으면 저장해도 학생에게 안 보인다.)
        // 검수 큐를 별도 화면으로 분리하면, 그때 이 값을 false로 바꾸고 큐에서 승인하게 한다.
        verified: true,
        source: "ai",
        reviewed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (itemErr || !itemRow) {
      log.push({ kind: "item", status: "error", message: `저장 실패: ${itemErr?.message ?? "알 수 없는 오류"}` });
      continue;
    }
    nextPosition += 1;
    itemIds.push(itemRow.id as string);
    log.push({ kind: "item", status: "created", message: prompt.slice(0, 60) });

    if (spokenTextForAudio) {
      const path = `admin/item-${itemRow.id}.wav`;
      const audioResult = await generateAndUpload(client, spokenTextForAudio, path);
      if (audioResult.ok) {
        await client.from("toefl_item").update({ payload: { ...payload, clip_path: path } }).eq("id", itemRow.id);
      } else {
        log.push({ kind: "item", status: "error", message: `음성 생성 실패(나중에 다시 시도 필요): ${audioResult.message}` });
      }
    }
  }

  return Response.json({ ok: true, stimulusId, itemIds, log });
}

async function generateAndUpload(
  client: SupabaseClient,
  text: string,
  path: string
): Promise<{ ok: true; durationSec: number } | { ok: false; message: string }> {
  const tts = await generateSpeechWav(text);
  if (!tts.ok) return { ok: false, message: tts.message };

  const { error } = await client.storage.from("toefl-audio").upload(path, tts.wav, { contentType: "audio/wav", upsert: true });
  if (error) return { ok: false, message: `업로드 실패: ${error.message}` };

  return { ok: true, durationSec: tts.durationSec };
}
