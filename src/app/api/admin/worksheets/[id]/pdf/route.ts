import { createClient } from "@supabase/supabase-js";
import { canManageMaterials } from "@/lib/roles";
import { generateWorksheetPdf, type PdfPart } from "@/lib/pdf/worksheet-pdf";

// 문제지를 인쇄용 PDF로 만든다 — 관리자 미리보기·다운로드에 쓴다(메일 첨부는 generateWorksheetPdf를 직접 호출).
// ?part=problems 문제만(정답 없음, 실전 시험 발송용) / ?part=answers 정답·해설만(결과 확인 후 발송용)
// / 생략 시 문제+정답 합본(관리자 미리보기·구독자 발송용).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// 헤드리스 브라우저 launch + 인쇄가 콜드 스타트에서 서버리스 기본 실행시간 제한(10초)을
// 넘을 수 있어(TOEFL 문항 생성 라우트와 같은 이유) 넉넉히 늘려둔다.
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(401, "로그인이 필요합니다.");

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return json(401, "로그인이 필요합니다.");

  const { data: me } = await asUser.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!canManageMaterials(me?.role)) return json(403, "권한이 없습니다.");

  const url = new URL(req.url);
  const partParam = url.searchParams.get("part");
  const part: PdfPart = partParam === "problems" || partParam === "answers" ? partParam : "both";

  const result = await generateWorksheetPdf(id, part);
  if (!result) return json(404, "문제지를 찾을 수 없습니다.");

  const download = url.searchParams.get("download") === "1";
  const suffix = part === "problems" ? "_문제" : part === "answers" ? "_해설" : "";
  const filename = `${result.title.replace(/[^\w가-힣0-9-]+/g, "_")}${suffix}.pdf`;

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

function json(status: number, message: string) {
  return Response.json({ ok: false, message }, { status });
}
