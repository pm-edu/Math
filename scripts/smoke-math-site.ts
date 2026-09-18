/**
 * LAUNCH.md A-3: math.pmedu4u.com 출시 전/후 확인용 smoke test.
 *
 * DNS 반영 전에는 로컬(NEXT_PUBLIC_FORCE_HOST=math, .env.local에 설정 후 npm run dev)에서
 * base URL로 http://localhost:3000 을 넘겨서 돌린다. DNS 반영 후에는 인수 없이 돌리면
 * 기본값 https://math.pmedu4u.com 을 검사한다.
 *
 * 일부 항목(로그인 필요 화면의 리다이렉트, 관리자 메뉴 노출 등)은 이 저장소 관행대로
 * 클라이언트 사이드에서 처리된다(src/components/Header.tsx의 isMathHost, 각 페이지의
 * supabase.auth.getUser() 체크 — 실제 데이터 접근 차단은 RLS가 함, 화면은 표시만 담당).
 * curl류 요청은 JS를 실행하지 않으므로 이런 항목은 PASS/FAIL 대신 SKIP으로 표시하고
 * 수동(브라우저) 확인이 필요하다고 표시한다.
 *
 * 사용법:
 *   npx tsx scripts/smoke-math-site.ts                              (기본 https://math.pmedu4u.com)
 *   npx tsx scripts/smoke-math-site.ts http://localhost:3000         (로컬)
 */

const baseUrl = (process.argv[2] ?? "https://math.pmedu4u.com").replace(/\/$/, "");

type Status = "PASS" | "FAIL" | "SKIP";

interface CheckResult {
  name: string;
  status: Status;
  detail: string;
  causeHint?: string;
}

const results: CheckResult[] = [];

async function fetchManual(path: string, init?: RequestInit) {
  return fetch(baseUrl + path, { ...init, redirect: "manual" });
}

async function checkRedirect(name: string, path: string, expectLocationIncludes: string, causeHint: string) {
  try {
    const res = await fetchManual(path);
    const location = res.headers.get("location") ?? "";
    const isRedirect = res.status >= 300 && res.status < 400;
    if (isRedirect && location.includes(expectLocationIncludes)) {
      results.push({ name, status: "PASS", detail: `${res.status} → ${location}` });
    } else {
      results.push({
        name,
        status: "FAIL",
        detail: `status=${res.status} location="${location}" (기대: 3xx → ${expectLocationIncludes} 포함)`,
        causeHint,
      });
    }
  } catch (e) {
    results.push({ name, status: "FAIL", detail: String(e), causeHint: "서버에 연결할 수 없음 — 서버가 떠 있는지, base URL이 맞는지 확인" });
  }
}

async function checkOk(name: string, path: string, causeHint: string) {
  try {
    const res = await fetch(baseUrl + path, { redirect: "follow" });
    if (res.status === 200) {
      results.push({ name, status: "PASS", detail: `${res.status}` });
    } else {
      results.push({ name, status: "FAIL", detail: `status=${res.status} (기대: 200)`, causeHint });
    }
  } catch (e) {
    results.push({ name, status: "FAIL", detail: String(e), causeHint: "서버에 연결할 수 없음" });
  }
}

async function checkNoMenuText(name: string, path: string) {
  try {
    const res = await fetch(baseUrl + path, { redirect: "follow" });
    const html = await res.text();
    const hits = ["TOEFL Prep", "SAT Prep"].filter((s) => html.includes(s));
    if (hits.length === 0) {
      results.push({ name, status: "PASS", detail: "서버 HTML에 TOEFL·SAT 메뉴 텍스트 없음" });
    } else {
      results.push({
        name,
        status: "FAIL",
        detail: `서버 HTML(하이드레이션 전)에 발견됨: ${hits.join(", ")}`,
        causeHint:
          "src/components/Header.tsx의 isMathHost는 useEffect(클라이언트 마운트 후)에만 true가 됨 — " +
          "SSR 첫 렌더에서는 항상 false라서 TOEFL/SAT 메뉴가 잠깐(하이드레이션 전) 원문 HTML에 포함됨. " +
          "curl·크롤러·JS 비활성 브라우저는 이 메뉴를 그대로 봄. 고치려면 호스트 판정을 서버(middleware가 " +
          "헤더로 내려주는 값 등)에서 하도록 옮겨야 함 — 적용 여부는 사용자 확인 후.",
      });
    }
  } catch (e) {
    results.push({ name, status: "FAIL", detail: String(e), causeHint: "서버에 연결할 수 없음" });
  }
}

async function checkClientGated(name: string, path: string, note: string) {
  try {
    const res = await fetch(baseUrl + path, { redirect: "manual" });
    results.push({
      name,
      status: "SKIP",
      detail: `HTTP status=${res.status} (셸 로드는 정상, 실제 게이트는 클라이언트+RLS) — ${note}`,
    });
  } catch (e) {
    results.push({ name, status: "FAIL", detail: String(e), causeHint: "서버에 연결할 수 없음" });
  }
}

async function main() {
  await checkRedirect("/ → /study", "/", "/study", "middleware의 MATH_ALLOWED_PREFIXES 목록이나 리다이렉트 로직 확인");
  await checkClientGated("/study (비로그인)", "/study", "실제 로그인 리다이렉트는 supabase.auth.getUser() 이후 router.replace('/login')(클라이언트) — 브라우저로 확인 필요");
  await checkOk("/login", "/login", "로그인 페이지 자체가 500/404인지 확인");
  await checkOk("/signup", "/signup", "가입 페이지 자체가 500/404인지 확인");
  await checkClientGated("/admin (비로그인)", "/admin", "middleware가 /admin/study로 리다이렉트만 하고, 실제 관리자 확인은 화면+RLS(클라이언트) — 브라우저로 확인 필요");
  await checkRedirect("/courses → /study", "/courses", "/study", "middleware의 MATH_ALLOWED_PREFIXES 목록 확인");
  await checkRedirect("/toefl → /study", "/toefl", "/study", "middleware의 MATH_ALLOWED_PREFIXES 목록 확인");
  await checkRedirect("/sat → /study", "/sat", "/study", "middleware의 MATH_ALLOWED_PREFIXES 목록 확인");
  await checkRedirect("/english → /study", "/english", "/study", "middleware의 MATH_ALLOWED_PREFIXES 목록 확인");
  await checkNoMenuText("HTML에 TOEFL/SAT 메뉴 텍스트 없음", "/study");

  const width = Math.max(...results.map((r) => r.name.length));
  console.log(`\nbase URL: ${baseUrl}\n`);
  console.log(`${"항목".padEnd(width)}  결과   상세`);
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.status.padEnd(4)}  ${r.detail}`);
    if (r.causeHint) console.log(`${" ".repeat(width)}         └─ 원인 후보: ${r.causeHint}`);
  }

  const fails = results.filter((r) => r.status === "FAIL").length;
  const skips = results.filter((r) => r.status === "SKIP").length;
  console.log(`\n총 ${results.length}건 — PASS ${results.length - fails - skips} / FAIL ${fails} / SKIP ${skips}(수동확인 필요)`);
  if (fails > 0) process.exitCode = 1;
}

main();
