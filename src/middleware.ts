import { NextResponse, type NextRequest } from "next/server";
import type { Subject } from "@/lib/subject";

// 접속 도메인으로 과목(수학/영어)을 강제 고정한다.
// english.pmedu4u.com 이면 영어, 그 외(기존 pmedu4u.com 포함)는 수학으로 취급한다.
// ?subject= 쿼리는 서브도메인이 없는 로컬 개발/Vercel 프리뷰 배포에서 테스트하기 위한 예외.
export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const queryOverride = request.nextUrl.searchParams.get("subject");
  const subject: Subject =
    queryOverride === "english" || queryOverride === "math"
      ? queryOverride
      : hostname.startsWith("english.")
        ? "english"
        : "math";

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
