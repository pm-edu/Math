/**
 * 가입 흐름 DB/API 레벨 보안 검증.
 *
 * ⚠️ 반드시 별도 스테이징 Supabase 프로젝트가 있어야 실행된다(scripts/lib/staging-env.ts
 * 참고) — .env.local(운영 DB)로는 절대 안 돈다. 3, 7번은 이 저장소의 Next.js API
 * 라우트(/api/auth/complete-signup)를 직접 호출하므로, STAGING_SUPABASE_* 로 설정된
 * 동일한 스테이징 프로젝트를 바라보는 앱 서버가 APP_BASE_URL(기본 http://localhost:3000)에
 * 떠 있어야 한다.
 *
 * 사용법:
 *   npx tsx scripts/test-signup-security.ts
 *
 * 필요 환경변수(scripts/.env.staging.local 또는 셸):
 *   STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SUPABASE_SERVICE_ROLE_KEY
 *   APP_BASE_URL (선택, 기본 http://localhost:3000)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireStagingEnv } from "./lib/staging-env";

const { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey, appBaseUrl } = requireStagingEnv();

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

type Result = { no: number; name: string; expected: string; actual: string; passed: boolean; note?: string };
const results: Result[] = [];
const createdEmails: string[] = [];

function freshEmail() {
  const email = `test-signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.pmedu4u.internal`;
  createdEmails.push(email);
  return email;
}

function freshClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
}

async function run() {
  // 1) 비밀번호 7자
  {
    const client = freshClient();
    const { error } = await client.auth.signUp({ email: freshEmail(), password: "abcd123" });
    results.push({
      no: 1,
      name: "비밀번호 7자로 가입 시도",
      expected: "거부됨",
      actual: error ? `거부됨 (${error.code ?? error.message})` : "허용됨(계정 생성됨)",
      passed: !!error,
      note: "이 결과는 앱 코드가 아니라 스테이징 프로젝트의 Auth 최소 길이 설정에 좌우된다 — 우리 앱의 8자 규칙은 브라우저 폼(React)에만 있고 Supabase Auth API 자체를 막지는 않는다.",
    });
  }

  // 2) 비밀번호 숫자 없이(8자 이상, 영문만)
  {
    const client = freshClient();
    const { error } = await client.auth.signUp({ email: freshEmail(), password: "abcdefgh" });
    results.push({
      no: 2,
      name: "비밀번호 숫자 없이 가입 시도",
      expected: "거부됨",
      actual: error ? `거부됨 (${error.code ?? error.message})` : "허용됨(계정 생성됨)",
      passed: !!error,
      note: "Supabase Auth의 '문자 종류 조합' 요구가 켜져 있어야만 막힌다(기본은 꺼져 있음). 우리 앱의 영문+숫자 규칙도 브라우저 폼에만 있다.",
    });
  }

  // 3) 약관 미동의로 가입 시도
  {
    const client = freshClient();
    const email = freshEmail();
    const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password: "Abcd1234" });
    if (signUpError || !signUpData.user) {
      results.push({
        no: 3,
        name: "약관 미동의로 가입 시도",
        expected: "가입(계정 생성) 자체는 막을 수 없고, 프로필 완료 단계(phone/curriculum/동의시각 기록)가 거부돼야 함",
        actual: `signUp() 자체가 실패함 (${signUpError?.message ?? "user 없음"}) — 이 케이스는 검증 못 함`,
        passed: false,
      });
    } else {
      const res = await fetch(`${appBaseUrl}/api/auth/complete-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: signUpData.user.id,
          phone: "010-1111-2222",
          curriculumGroup: "KR",
          termsAgreed: false,
          privacyAgreed: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      results.push({
        no: 3,
        name: "약관 미동의로 가입 시도",
        expected: "complete-signup이 400으로 거부, profiles에 동의시각 안 남음",
        actual: `signUp()은 성공(계정 자체는 생성됨) / complete-signup → ${res.status} ${JSON.stringify(body)}`,
        passed: res.status === 400,
        note: "Supabase Auth 자체는 '약관 동의' 개념을 모르기 때문에 auth.users 행 생성은 막을 수 없다. 우리 앱의 유일한 방어선은 complete-signup 라우트뿐이다 — 즉 누가 이 라우트를 안 거치고 signUp()만 직접 호출하면 동의 없이도 계정은 만들어진다(프로필의 phone/curriculum/동의시각만 비어있는 상태로 남음).",
      });
    }
  }

  // 4) role=admin 스푸핑
  {
    const client = freshClient();
    const email = freshEmail();
    const { data, error } = await client.auth.signUp({
      email,
      password: "Abcd1234",
      options: { data: { name: "테스트", role: "admin" } },
    });
    if (error || !data.user) {
      results.push({ no: 4, name: "role=admin 스푸핑", expected: "role 컬럼은 항상 'student'", actual: `signUp 실패: ${error?.message}`, passed: false });
    } else {
      await sleep(500); // 트리거가 profiles 행을 만들 시간
      const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      results.push({
        no: 4,
        name: "role=admin 스푸핑",
        expected: "student",
        actual: profile?.role ?? "(프로필 없음)",
        passed: profile?.role === "student",
      });
    }
  }

  // 5) 중복 이메일
  {
    const client = freshClient();
    const email = freshEmail();
    await client.auth.signUp({ email, password: "Abcd1234" });
    const second = freshClient();
    const { error } = await second.auth.signUp({ email, password: "Abcd1234" });
    results.push({
      no: 5,
      name: "중복 이메일 재가입",
      expected: "user_already_exists / email_exists 에러",
      actual: error ? `${error.code ?? error.message}` : "허용됨(중복 계정?)",
      passed: error?.code === "user_already_exists" || error?.code === "email_exists",
    });
  }

  // 6) 가입 성공 후 profiles 기록 확인
  {
    const client = freshClient();
    const email = freshEmail();
    const { data, error } = await client.auth.signUp({ email, password: "Abcd1234" });
    if (error || !data.user) {
      results.push({ no: 6, name: "가입 후 phone/curriculum/동의시각 기록", expected: "전부 기록됨", actual: `signUp 실패: ${error?.message}`, passed: false });
    } else {
      const res = await fetch(`${appBaseUrl}/api/auth/complete-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          phone: "010-3333-4444",
          curriculumGroup: "IB",
          termsAgreed: true,
          privacyAgreed: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const { data: profile } = await admin
        .from("profiles")
        .select("phone, curriculum_group, terms_agreed_at, privacy_agreed_at")
        .eq("id", data.user.id)
        .maybeSingle();
      const allRecorded = !!(profile?.phone && profile?.curriculum_group && profile?.terms_agreed_at && profile?.privacy_agreed_at);
      results.push({
        no: 6,
        name: "가입 후 phone/curriculum/동의시각 기록",
        expected: "전부 기록됨",
        actual: `complete-signup ${res.status} ${JSON.stringify(body)} / profiles=${JSON.stringify(profile)}`,
        passed: allRecorded,
      });
    }
  }

  // 7) 미인증 로그인 차단
  {
    const client = freshClient();
    const email = freshEmail();
    await client.auth.signUp({ email, password: "Abcd1234" });
    const loginClient = freshClient();
    const { error } = await loginClient.auth.signInWithPassword({ email, password: "Abcd1234" });
    results.push({
      no: 7,
      name: "미인증 상태로 로그인",
      expected: "email_not_confirmed 에러로 차단",
      actual: error ? `${error.code ?? error.message}` : "로그인 허용됨(세션 발급)",
      passed: error?.code === "email_not_confirmed",
      note: "스테이징 프로젝트의 Authentication > Email 'Confirm email' 설정이 켜져 있어야 이 테스트가 의미 있다. 꺼져 있으면 로그인이 그냥 성공한다(우리 앱의 email_not_confirmed 처리 코드 자체는 정상이어도 이 테스트는 실패로 나온다).",
    });
  }

  // 정리 — test-signup-* 패턴 이메일만 삭제
  console.log("\n정리 중...");
  for (const email of createdEmails) {
    if (!email.startsWith("test-signup-")) continue; // 이중 안전장치
    const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profile) {
      const { error } = await admin.auth.admin.deleteUser(profile.id);
      console.log(error ? `  삭제 실패 ${email}: ${error.message}` : `  삭제됨 ${email}`);
    }
  }

  printReport();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printReport() {
  console.log("\n| # | 항목 | 기대 | 실제 | 결과 |");
  console.log("|---|---|---|---|---|");
  for (const r of results) {
    console.log(`| ${r.no} | ${r.name} | ${r.expected} | ${r.actual.replace(/\|/g, "\\|")} | ${r.passed ? "✅ PASS" : "❌ FAIL"} |`);
  }
  const notes = results.filter((r) => r.note);
  if (notes.length > 0) {
    console.log("\n참고:");
    for (const r of notes) console.log(`- #${r.no}: ${r.note}`);
  }
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
