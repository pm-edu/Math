/**
 * choose_a_response(듣기, 발화 듣고 응답 고르기) 오디오 유실 복구 — spoken_text_private가
 * 없는(=원래 들려줄 문장을 잃어버린) 문항에 Claude로 새 발화문을 만들어 채운다.
 * [[toefl-item-pipeline-project]] 참고. 이미 정해진 정답(options/answer_key)과 해설은
 * 그대로 두고, 그 정답이 자연스러운 응답이 되는 발화문만 새로 짓는다 — 문항 내용 자체는
 * 안 바꾼다.
 *
 * 이후 `npm run toefl:generate-audio`(scripts/toefl-generate-demo-audio.ts)를 돌리면
 * 여기서 채운 spoken_text_private로 실제 오디오가 만들어지고 문항이 다시 활성화된다
 * (demo-audio.ts 2026-08-31 수정 참고). 이 스크립트는 텍스트만 만든다 — Gemini TTS
 * 할당량과 무관하게(Anthropic만 씀) 지금 바로 돌릴 수 있다.
 *
 * 안전장치: --confirm 없이는 API 호출도 저장도 안 한다.
 *
 * 사용법:
 *   npx tsx scripts/toefl/repair-choose-a-response.ts [--confirm]
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal();

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type Item = {
  id: string;
  payload: { clip_path?: string | null; options?: { id: string; text: string }[] };
  answer_key: { correct?: string[] } | null;
  explanation_ko: string | null;
};

function buildPrompt(item: Item): string {
  const options = item.payload.options ?? [];
  const correctId = item.answer_key?.correct?.[0];
  const optionsText = options.map((o) => `${o.id}) ${o.text}${o.id === correctId ? "  ← 정답" : ""}`).join("\n");
  return `A TOEFL Listening "Choose a Response" item lost its original spoken utterance. Write ONE natural, short spoken utterance (a question or statement someone might say in daily campus life) that these four possible responses would fit, where the response marked "← 정답" is clearly the best natural reply.

Options:
${optionsText}

Korean explanation for why that option is correct (context only, do not translate it):
${item.explanation_ko ?? "(없음)"}

Return ONLY the utterance itself — one sentence, no quotes, no explanation, no markdown.`;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const db = serviceClient();

  const { data: candidates, error } = await db
    .from("toefl_item")
    .select("id, payload, answer_key, explanation_ko")
    .eq("task_type", "choose_a_response")
    .is("spoken_text_private", null);
  if (error) {
    console.error("문항 조회 실패:", error.message);
    process.exit(1);
  }
  // clip_path가 이미 있는 것(옛 데모 3개, 오디오가 이미 있어 손댈 필요 없음)은 제외.
  const rows = ((candidates ?? []) as Item[]).filter((r) => !r.payload?.clip_path);
  console.log(`\n복구 대상(spoken_text_private 없음, 오디오도 없음): ${rows.length}개\n`);
  if (rows.length === 0) return;

  if (!confirm) {
    console.log("--confirm 이 없어 실제 Claude 호출은 하지 않습니다.\n");
    return;
  }

  const anthropic = new Anthropic();
  let saved = 0;
  let failed = 0;
  for (const item of rows) {
    const options = item.payload.options ?? [];
    if (options.length === 0 || !item.answer_key?.correct?.length) {
      failed += 1;
      console.log(`  · ${item.id}: 보기/정답 정보가 없어 건너뜀`);
      continue;
    }
    let utterance = "";
    try {
      const res = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 300,
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        messages: [{ role: "user", content: buildPrompt(item) }],
      });
      const textBlock = res.content.find((b) => b.type === "text");
      utterance = textBlock?.type === "text" ? textBlock.text.trim().replace(/^["']|["']$/g, "") : "";
    } catch (e) {
      failed += 1;
      console.log(`  · ${item.id}: Claude 호출 실패 — ${(e as Error).message}`);
      continue;
    }
    if (!utterance) {
      failed += 1;
      console.log(`  · ${item.id}: 빈 응답`);
      continue;
    }
    const { error: updateErr } = await db.from("toefl_item").update({ spoken_text_private: utterance }).eq("id", item.id);
    if (updateErr) {
      failed += 1;
      console.log(`  · ${item.id}: 저장 실패 — ${updateErr.message}`);
      continue;
    }
    saved += 1;
    console.log(`  · ${item.id}: "${utterance}"`);
  }
  console.log(`\n완료: ${saved}개 복구, ${failed}개 실패.`);
  console.log(`다음: npm run toefl:generate-audio 를 돌리면 실제 오디오가 만들어지고 문항이 다시 활성화됩니다(Gemini TTS 할당량 필요).\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
