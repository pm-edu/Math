/**
 * 가입 → 온보딩 브라우저 흐름 E2E.
 *
 * ⚠️ 이것도 별도 스테이징 Supabase 프로젝트 + 그 프로젝트를 바라보는 앱 서버가 필요하다
 * (scripts/lib/staging-env.ts 참고). .env.local(운영 DB)을 보는 채로는 이 테스트를 절대
 * 돌리면 안 된다 — 아래 가드가 APP_BASE_URL이 운영 도메인이면 즉시 실패시킨다.
 *
 * 지시서는 3번 흐름의 목적지를 "/study/onboarding"으로 적었지만, 그 경로는 이미 수학
 * 진단·배치 기능(src/app/study/onboarding/page.tsx, math-progression PG4)이 쓰고 있는
 * 별개 기능이라 겹치면 안 된다. 실제 구현(src/app/login/page.tsx)은 가입 후 첫 로그인을
 * /onboarding/subjects로 보낸다 — RUN_SIGNUP.md S0/S4 보고에서 이미 이 경로 변경을
 * 알려드렸다. 여기서도 실제 라우트인 /onboarding/subjects를 검증한다.
 *
 * 실행: npx playwright test tests/signup.e2e.ts
 * (최초 1회 npx playwright install 필요 — 브라우저 바이너리 다운로드)
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { requireStagingEnv } from "../scripts/lib/staging-env";

const { supabaseUrl, supabaseServiceRoleKey, appBaseUrl } = requireStagingEnv();
const admin = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });

function freshEmail() {
  return `test-signup-e2e-${Date.now()}@test.pmedu4u.internal`;
}

const createdEmails: string[] = [];

test.afterAll(async () => {
  for (const email of createdEmails) {
    if (!email.startsWith("test-signup-")) continue; // 이중 안전장치
    const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profile) await admin.auth.admin.deleteUser(profile.id);
  }
});

test("1) /signup 접속 시 필수 필드 6개가 폼에 존재한다", async ({ page }) => {
  await page.goto(`${appBaseUrl}/signup`);
  await expect(page.getByPlaceholder("홍길동")).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
  await expect(page.getByPlaceholder("영문+숫자 포함 8자 이상")).toHaveCount(2); // 비밀번호 + 비밀번호 확인
  await expect(page.getByPlaceholder(/010-1234-5678/)).toBeVisible();
  await expect(page.getByRole("combobox")).toBeVisible(); // 커리큘럼
});

test("2) 유효한 값으로 가입하면 인증 안내 화면으로 간다", async ({ page }) => {
  const email = freshEmail();
  createdEmails.push(email);

  await page.goto(`${appBaseUrl}/signup`);
  await page.getByPlaceholder("홍길동").fill("테스트 사용자");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("영문+숫자 포함 8자 이상").first().fill("Abcd1234");
  await page.getByPlaceholder("영문+숫자 포함 8자 이상").nth(1).fill("Abcd1234");
  await page.getByPlaceholder(/010-1234-5678/).fill("010-1234-5678");
  await page.getByRole("combobox").selectOption("KR");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "회원가입" }).click();

  await expect(page.getByText("가입 확인 이메일을 보냈어요")).toBeVisible({ timeout: 10_000 });
});

test("3) 인증 처리 후 첫 로그인은 /onboarding/subjects로 간다", async ({ page }) => {
  const email = freshEmail();
  createdEmails.push(email);
  const password = "Abcd1234";

  // 실제 메일 링크를 클릭할 수 없으므로, 테스트 전용으로 서버에서 이메일 인증을 대신 처리한다.
  const anon = createClient(supabaseUrl, process.env.STAGING_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: signUpData, error } = await anon.auth.signUp({ email, password });
  if (error || !signUpData.user) throw new Error(`사전 가입 실패: ${error?.message}`);
  await admin.auth.admin.updateUserById(signUpData.user.id, { email_confirm: true });
  await fetch(`${appBaseUrl}/api/auth/complete-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: signUpData.user.id,
      phone: "010-1234-5678",
      curriculumGroup: "KR",
      termsAgreed: true,
      privacyAgreed: true,
    }),
  });

  await page.goto(`${appBaseUrl}/login`);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();

  await page.waitForURL(/\/onboarding\/subjects/, { timeout: 10_000 });
  await expect(page.getByText("관심 있는 과목을 골라주세요")).toBeVisible();
});

test("4) 온보딩에서 과목을 고르면 student_programs에 interested로 기록된다", async ({ page }) => {
  const email = freshEmail();
  createdEmails.push(email);
  const password = "Abcd1234";

  const anon = createClient(supabaseUrl, process.env.STAGING_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: signUpData, error } = await anon.auth.signUp({ email, password });
  if (error || !signUpData.user) throw new Error(`사전 가입 실패: ${error?.message}`);
  await admin.auth.admin.updateUserById(signUpData.user.id, { email_confirm: true });
  await fetch(`${appBaseUrl}/api/auth/complete-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: signUpData.user.id, phone: "010-1234-5678", curriculumGroup: "KR", termsAgreed: true, privacyAgreed: true }),
  });

  await page.goto(`${appBaseUrl}/login`);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/onboarding\/subjects/, { timeout: 10_000 });

  await page.getByText("수학", { exact: true }).click();
  await page.getByRole("button", { name: "선택 완료" }).click();
  await expect(page.getByText("관심 과목 등록이 완료됐습니다.")).toBeVisible({ timeout: 10_000 });

  const { data: rows } = await admin
    .from("student_programs")
    .select("program, status")
    .eq("student_id", signUpData.user.id);
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ program: "math", status: "interested" })]));
});
