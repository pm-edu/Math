/**
 * TOEFL_DEMO_001 데모 Listening/Speaking 오디오 생성 CLI.
 *
 * 화면 검토(2026-08-27) [D]: 원래 /admin/toefl/audio 관리자 화면이었던 것을 여기로 옮겼다.
 * 1회성 시드 도구를 상시 관리자 메뉴에 둘 이유가 없고(문항 생성 CLI와 같은 이유,
 * scripts/toefl-generate.ts 참고), 실행 결과는 터미널 로그로 보는 게 더 간단하다.
 *
 * 사용법:
 *   npm run toefl:generate-audio
 *   npm run toefl:generate-audio -- --force   (이미 있는 오디오도 다시 생성)
 *
 * 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { generateDemoAudio } from "@/lib/toefl/server/demo-audio";

// scripts/toefl-generate.ts와 같은 방식 — dotenv 없이 .env.local을 직접 읽는다.
function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("환경변수가 없습니다: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const force = process.argv.includes("--force");
  const client = makeServiceClient();
  console.log(`TOEFL_DEMO_001 데모 오디오 생성${force ? " (강제 재생성)" : ""}…`);
  const log = await generateDemoAudio(client, { force });
  for (const entry of log) {
    console.log(`  [${entry.kind}] ${entry.id} ${entry.status}: ${entry.message}`);
  }
  const generated = log.filter((l) => l.status === "generated").length;
  const skipped = log.filter((l) => l.status === "skipped").length;
  const errored = log.filter((l) => l.status === "error").length;
  console.log(`\n완료: ${generated}건 생성, ${skipped}건 건너뜀, ${errored}건 실패.`);
}

main();
