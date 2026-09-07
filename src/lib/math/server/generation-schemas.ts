// 수학 문항 대량 생성 응답의 zod 스키마. 자동채점 가능한 두 형식(mcq/numeric)만 다룬다
// (RUN_MATH_PROGRESSION.md PG-A 게이트 1: 자동채점 후보=정수+소수+분수 비율이 낮아 STOP됨 —
// 문항을 먼저 채워 넣는 이 파이프라인이 그 STOP을 풀기 위한 선행 작업).

import { z } from "zod";

const McqItemSchema = z.object({
  format: z.literal("mcq"),
  contentText: z.string().min(1),
  choices: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  solutionText: z.string().min(1),
  difficulty: z.enum(["하", "중", "상"]),
});

const NumericItemSchema = z.object({
  format: z.literal("numeric"),
  contentText: z.string().min(1),
  answerRaw: z.string().min(1), // "3/4", "12", "-2.5" 같은 형태 — parseSpr로 검증
  solutionText: z.string().min(1),
  difficulty: z.enum(["하", "중", "상"]),
});

export const MathGeneratedItemSchema = z.discriminatedUnion("format", [McqItemSchema, NumericItemSchema]);
export type MathGeneratedItem = z.infer<typeof MathGeneratedItemSchema>;

export const MathGeneratedBatchSchema = z.object({
  items: z.array(MathGeneratedItemSchema).min(1),
});
export type MathGeneratedBatch = z.infer<typeof MathGeneratedBatchSchema>;
