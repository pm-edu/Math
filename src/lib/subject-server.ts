import { cookies } from "next/headers";
import type { Subject } from "@/lib/subject";

/** 서버 컴포넌트에서 접속 도메인이 고정한 과목을 읽는다 (subject 쿠키, src/middleware.ts가 세팅). */
export async function getSubject(): Promise<Subject> {
  const cookieStore = await cookies();
  return cookieStore.get("subject")?.value === "english" ? "english" : "math";
}
