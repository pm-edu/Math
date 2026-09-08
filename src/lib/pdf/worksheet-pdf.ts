import { createServiceClient } from "@/lib/supabase/service";
import { buildProblemsHtml, buildAnswersHtml, buildWorksheetPrintHtml } from "./worksheet-html";
import { htmlToPdfBuffer } from "./generate";
import type { Problem, Worksheet } from "@/lib/problems";

export type PdfPart = "problems" | "answers" | "both";

// 문제지 하나의 PDF를 만든다 — API 라우트(관리자 다운로드)와 메일 발송 로직이 공용으로 쓴다.
export async function generateWorksheetPdf(
  worksheetId: string,
  part: PdfPart = "both"
): Promise<{ buffer: Buffer; title: string } | null> {
  const admin = createServiceClient();

  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, title, description, subject, is_exam, time_limit_minutes, created_at")
    .eq("id", worksheetId)
    .maybeSingle();
  if (!worksheet) return null;

  const { data: wp } = await admin
    .from("worksheet_problems")
    .select("position, problem:problems(*)")
    .eq("worksheet_id", worksheetId)
    .order("position");
  const problems = (wp ?? []).flatMap((r) => {
    const p = (r as { problem: Problem | Problem[] | null }).problem;
    return Array.isArray(p) ? p : p ? [p] : [];
  });

  const html =
    part === "problems"
      ? buildProblemsHtml(worksheet as Worksheet, problems)
      : part === "answers"
      ? buildAnswersHtml(worksheet as Worksheet, problems)
      : buildWorksheetPrintHtml(worksheet as Worksheet, problems);

  const buffer = await htmlToPdfBuffer(html);
  return { buffer, title: worksheet.title };
}
