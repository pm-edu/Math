import { NextResponse, type NextRequest } from "next/server";
import type { Subject } from "@/lib/subject";

// 접속 도메인으로 과목(수학/영어)을 강제 고정한다.
// english.pmedu4u.com 이면 영어, 그 외(기존 pmedu4u.com 포함)는 수학으로 취급한다.
// ?subject= 쿼리는 서브도메인이 없는 로컬 개발/Vercel 프리뷰 배포에서 테스트하기 위한 예외.
//
// toefl.pmedu4u.com은 완전히 별개 사이트처럼 보이게 /toefl 경로만 남기고 나머지는
// 전부 그리로 리다이렉트한다(로그인류 경로만 예외 — TOEFL 화면도 같은 로그인을 쓰므로).
// 화면(TOEFL 페이지들)은 이미 공용 Header/Footer를 안 쓰고 있어 이것만으로 독립된 사이트처럼 보인다.
//
// 관리 화면은 "/admin/toefl" 접두사만 허용한다(2026-08-19). TOEFL 사이트에서 TOEFL 문항·오디오를
// 직접 관리하되, /admin 허브나 /admin/problems 같은 다른 과목 관리 화면은 계속 막힌다 —
// 접두사가 정확히 /admin/toefl 이라 "토플 사이트에서는 토플만"이 경로 수준에서 보장된다.
const TOEFL_ALLOWED_PREFIXES = [
  "/toefl",
  "/api/toefl",
  "/admin/toefl",
  "/api/admin/toefl",
  "/login",
  "/signup",
  "/reset-password",
];

// SAT(디지털 SAT, sat.pmedu4u.com)도 TOEFL과 똑같은 방식으로 독립시킨다. 관리 화면 접두사는
// "/admin/sat"이 아니라 "/admin/digital-sat"이다 — /admin/sat은 기존 범용 문제은행에 SAT
// 지문·문항을 넣는 레거시 도구가 이미 그 이름을 쓰고 있어서(사용자 확인, 2026-09-04) 이름을
// 겹치지 않게 새로 골랐다.
const SAT_ALLOWED_PREFIXES = [
  "/sat",
  "/api/sat",
  "/admin/digital-sat",
  "/api/admin/digital-sat",
  "/login",
  "/signup",
  "/reset-password",
];

// math.pmedu4u.com도 같은 방식으로 독립시킨다(RUN_MATH_SITE.md 1단계). 신규 학생/관리 화면
// (/study, /admin/study)뿐 아니라, 그 관리 네비게이션이 계속 링크하는 기존 화면
// (/admin/problems 등 4개, 1-3에 명시됨)도 막히면 안 되므로 같이 허용한다.
const MATH_ALLOWED_PREFIXES = [
  "/study",
  "/api/study",
  "/api/math",
  "/admin/study",
  "/admin/problems",
  "/admin/worksheets",
  "/api/admin/worksheets",
  "/admin/classes",
  "/admin/attendance",
  "/login",
  "/signup",
  "/reset-password",
  "/report",
];

export function middleware(request: NextRequest) {
  // 로컬 개발·Vercel 프리뷰에는 실제 서브도메인이 없어서(기존 ?subject= 오버라이드와 같은 이유,
  // 위 주석 참고) math. 분기를 시뮬레이션할 방법이 저장소에 아직 없었다 — 이 dev 전용 환경변수로
  // 대신한다. 프로덕션에서는 보통 설정 안 하므로 실제 호스트 그대로 쓰인다.
  const forceHost = process.env.NEXT_PUBLIC_FORCE_HOST;
  const hostname = forceHost ? `${forceHost}.pmedu4u.com` : request.headers.get("host") || "";
  const { pathname } = request.nextUrl;
  const queryOverride = request.nextUrl.searchParams.get("subject");
  const subject: Subject =
    queryOverride === "english" || queryOverride === "math"
      ? queryOverride
      : hostname.startsWith("english.")
        ? "english"
        : "math";

  if (hostname.startsWith("toefl.") && !TOEFL_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/toefl", request.url));
  }

  if (hostname.startsWith("sat.") && !SAT_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/sat", request.url));
  }

  if (hostname.startsWith("math.")) {
    if (pathname === "/admin" || pathname === "/admin/") {
      return NextResponse.redirect(new URL("/admin/study", request.url));
    }
    if (!MATH_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/study", request.url));
    }
  }

  const response = NextResponse.next();
  response.cookies.set("subject", subject, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
