// 수학 문항 대량 생성 응답의 zod 스키마. 자동채점 가능한 두 형식(mcq/numeric)만 다룬다
// (RUN_MATH_PROGRESSION.md PG-A 게이트 1: 자동채점 후보=정수+소수+분수 비율이 낮아 STOP됨 —
// 문항을 먼저 채워 넣는 이 파이프라인이 그 STOP을 풀기 위한 선행 작업).

import { z } from "zod";
import { FigureSpecSchema } from "@/lib/sat/generation-schemas";

// 도형·그래프 스펙 — SAT 서브시스템의 결정론적 렌더러(src/lib/sat/figure)를 그대로 재사용한다.
// LLM이 SVG 좌표를 직접 만들면 틀리기 쉽고, PDF 교재에서 추출하면 출판사 저작권 문제가 있어
// (2026-09-09 사용자 지적) 구조화된 스펙만 생성하게 하고 그리기는 코드가 결정론적으로 한다.
// 5지선다 — 한국 수학 객관식(내신·모의고사) 관례. src/app/admin/generate/page.tsx의
// LETTERS(A~E)와 같은 관례인데 이 파이프라인은 실수로 4개(A~D)로 만들고 있었다
// (2026-09-09 사용자 지적 — 이미 생성된 문항도 다시 만듦).
const McqItemSchema = z.object({
  format: z.literal("mcq"),
  contentText: z.string().min(1),
  choices: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  solutionText: z.string().min(1),
  difficulty: z.enum(["하", "중", "상"]),
  figure: FigureSpecSchema.optional(),
});

const NumericItemSchema = z.object({
  format: z.literal("numeric"),
  contentText: z.string().min(1),
  answerRaw: z.string().min(1), // "3/4", "12", "-2.5" 같은 형태 — parseSpr로 검증
  solutionText: z.string().min(1),
  difficulty: z.enum(["하", "중", "상"]),
  figure: FigureSpecSchema.optional(),
});

export const MathGeneratedItemSchema = z.discriminatedUnion("format", [McqItemSchema, NumericItemSchema]);
export type MathGeneratedItem = z.infer<typeof MathGeneratedItemSchema>;

export const MathGeneratedBatchSchema = z.object({
  items: z.array(MathGeneratedItemSchema).min(1),
});
export type MathGeneratedBatch = z.infer<typeof MathGeneratedBatchSchema>;
