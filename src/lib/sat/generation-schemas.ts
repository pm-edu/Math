// SAT 문항 생성 응답의 zod 스키마 — Gate A1(스키마 통과)이 이 스키마로 검증한다.

import { z } from "zod";
import { RW_SKILLS, MATH_SKILLS } from "./taxonomy";
import type { FigureSpec } from "./figure/types";

const RW_SKILL_KEYS = RW_SKILLS.map((s) => s.key) as [string, ...string[]];
const MATH_SKILL_KEYS = MATH_SKILLS.map((s) => s.key) as [string, ...string[]];

const FigureSpecSchema: z.ZodType<FigureSpec> = z.union([
    z.object({
      kind: z.literal("coordinate_plane"),
      xRange: z.tuple([z.number(), z.number()]),
      yRange: z.tuple([z.number(), z.number()]),
      points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })).optional(),
      lines: z.array(z.object({ a: z.number(), b: z.number(), c: z.number() })).optional(),
      curves: z.array(z.object({ expr: z.string(), label: z.string().optional() })).optional(),
    }),
    z.object({
      kind: z.literal("triangle"),
      vertices: z.tuple([
        z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
        z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
        z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
      ]),
      labels: z.tuple([z.string(), z.string(), z.string()]).optional(),
      sideLabels: z.object({ ab: z.string().optional(), bc: z.string().optional(), ca: z.string().optional() }).optional(),
      rightAngleAt: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    }),
    z.object({
      kind: z.literal("circle"),
      center: z.object({ x: z.number(), y: z.number(), label: z.string().optional() }),
      radius: z.number().positive(),
      radiusLabel: z.string().optional(),
      points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })).optional(),
      chords: z.array(z.object({ from: z.number().int(), to: z.number().int(), label: z.string().optional() })).optional(),
    }),
    z.object({
      kind: z.literal("bar_chart"),
      categories: z.array(z.string()).min(1),
      values: z.array(z.number()).min(1),
      xLabel: z.string().optional(),
      yLabel: z.string().optional(),
    }),
    z.object({
      kind: z.literal("scatter"),
      points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string().optional() })).min(1),
      xLabel: z.string().optional(),
      yLabel: z.string().optional(),
      trendLine: z.object({ slope: z.number(), intercept: z.number() }).optional(),
    }),
    z.object({
      kind: z.literal("table"),
      headers: z.array(z.string()).min(1),
      rows: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
      caption: z.string().optional(),
    }),
  ]);

export const RwGeneratedItemSchema = z.object({
  materialId: z.string(),
  stimulus: z.object({ passageText: z.string() }),
  question: z.object({
    skill: z.enum(RW_SKILL_KEYS),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    prompt: z.string(),
    choices: z.tuple([z.string(), z.string(), z.string(), z.string()]),
    answerText: z.string(),
    explanationKo: z.string(),
    figure: FigureSpecSchema.optional(),
  }),
});
export type RwGeneratedItem = z.infer<typeof RwGeneratedItemSchema>;

const MathMcqItemSchema = z.object({
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  format: z.literal("mcq"),
  prompt: z.string(),
  choices: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  answerText: z.string(),
  explanationKo: z.string(),
  figure: FigureSpecSchema.optional(),
});

const MathSprItemSchema = z.object({
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  format: z.literal("spr"),
  prompt: z.string(),
  sprAccepted: z.array(z.string()).min(1), // 원문 그대로("7/2", "0.5" 등) — parseSpr로 나중에 파싱
  sprTolerance: z.object({ min: z.string(), max: z.string() }).optional(),
  explanationKo: z.string(),
  figure: FigureSpecSchema.optional(),
});

export const MathGeneratedItemSchema = z.discriminatedUnion("format", [MathMcqItemSchema, MathSprItemSchema]);
export type MathGeneratedItem = z.infer<typeof MathGeneratedItemSchema>;

export const MathGeneratedBatchSchema = z.object({
  skill: z.enum(MATH_SKILL_KEYS),
  items: z.array(MathGeneratedItemSchema).min(1),
});
export type MathGeneratedBatch = z.infer<typeof MathGeneratedBatchSchema>;
