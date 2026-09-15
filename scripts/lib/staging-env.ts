/**
 * 가입 검증 스크립트 전용 환경 가드.
 *
 * 이 저장소는 로컬 개발(localhost:3000)과 운영(pmedu4u.com)이 완전히 같은 Supabase
 * 프로젝트(ddaibbppzuvflmuoyuvf)를 공유한다 — supabase/config.toml 같은 로컬 전용 설정도,
 * .env.production/.env.staging도 없다(2026-09-15 확인). 즉 "localhost에서 돌리면 안전"이
 * 아니라 "지금 이 저장소엔 안전한 DB가 아예 없다"가 사실이다. .env.local 값을 그대로 쓰면
 * 어떤 호스트에서 실행하든 운영 DB를 건드리게 된다.
 *
 * 그래서 이 가드는 .env.local을 절대 읽지 않는다. STAGING_SUPABASE_URL /
 * STAGING_SUPABASE_ANON_KEY / STAGING_SUPABASE_SERVICE_ROLE_KEY — 완전히 별도의
 * Supabase 프로젝트를 가리키는 별도 환경변수 3개가 다 있어야만 통과한다. 하나라도 없거나,
 * URL이 알려진 운영 프로젝트를 가리키면 그 자리에서 즉시 중단한다.
 *
 * 별도 스테이징 프로젝트를 만드는 법(요약): supabase.com에서 새 프로젝트 생성(무료 등급) →
 * 이 저장소의 supabase/*.sql + supabase/migrations/*.sql을 그 프로젝트의 SQL Editor에
 * 순서대로 실행 → 그 프로젝트의 URL/anon key/service_role key를 scripts/.env.staging.local에
 * STAGING_SUPABASE_URL=... 형태로 적어둔다(이 파일은 .env.local과 별개이며 git에 커밋하지
 * 않는다).
 */
import { readFileSync } from "node:fs";

const PRODUCTION_PROJECT_REF = "ddaibbppzuvflmuoyuvf";
const PRODUCTION_HOSTNAMES = ["pmedu4u.com", "www.pmedu4u.com", "english.pmedu4u.com", "toefl.pmedu4u.com", "sat.pmedu4u.com"];

function loadStagingEnvFile() {
  let raw: string;
  try {
    raw = readFileSync("scripts/.env.staging.local", "utf8");
  } catch {
    return; // 없으면 셸 환경변수만 본다 — .env.local은 절대 대신 읽지 않는다
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

export interface StagingConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  appBaseUrl: string;
}

export function requireStagingEnv(): StagingConfig {
  loadStagingEnvFile();

  const supabaseUrl = process.env.STAGING_SUPABASE_URL;
  const supabaseAnonKey = process.env.STAGING_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    fail(
      "STAGING_SUPABASE_URL / STAGING_SUPABASE_ANON_KEY / STAGING_SUPABASE_SERVICE_ROLE_KEY 가 없습니다.\n" +
        "이 저장소는 로컬과 운영이 같은 Supabase 프로젝트를 쓰기 때문에 .env.local 값으로는\n" +
        "이 스크립트를 절대 실행할 수 없습니다(그게 곧 운영 DB입니다).\n" +
        "별도 스테이징 Supabase 프로젝트를 만들고 scripts/.env.staging.local에 세 값을 채워주세요\n" +
        "(scripts/lib/staging-env.ts 상단 주석 참고)."
    );
  }

  if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
    fail(`STAGING_SUPABASE_URL이 운영 프로젝트(${PRODUCTION_PROJECT_REF})를 가리키고 있습니다.`);
  }

  for (const host of PRODUCTION_HOSTNAMES) {
    if (appBaseUrl.includes(host)) {
      fail(`APP_BASE_URL이 운영 도메인(${host})을 가리키고 있습니다.`);
    }
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, appBaseUrl };
}

function fail(message: string): never {
  console.error(`\n🔴 중단: ${message}\n`);
  process.exit(1);
}
