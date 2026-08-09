import { revalidatePath } from "next/cache";

// 관리자가 강좌·강의를 등록/삭제한 직후 호출해서
// 미리 만들어 둔 페이지를 즉시 새로 굽게 한다.
// (호출하지 않아도 60초 주기로는 갱신된다)
export async function POST() {
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
