// 수학 학습 진행 구조 PG-A: 채점 함수 (RUN_MATH_PROGRESSION.md A-4). 순수 함수 — DB 접근 없음.
//
// numeric 채점은 부동소수점 비교를 절대 하지 않는다(0.1+0.2!==0.3 문제). SAT의 SPR 파서
// (src/lib/sat/spr.ts, bigint 유리수)를 그대로 재사용해서 제출값·정답을 정규화·비교한다.

import { z } from "zod";
import { parseSpr, type Rational } from "@/lib/sat/spr";

export type AnswerFormat = "mcq" | "numeric" | "expression" | "free";

export interface GradeResult {
  correct: boolean;
  normalized: string;
  reason?: string;
}

const McqSpecSchema = z.object({
  choices: z.array(z.string()).min(2),
  correct_index: z.number().int().min(0),
});

const NumericSpecSchema = z.object({
  value: z.string(),
  tolerance: z.number().min(0).default(0),
  accept: z.array(z.string()).default([]),
});

const ExpressionSpecSchema = z.object({
  canonical: z.string(),
  vars: z.array(z.string()).default([]),
});

const FreeSpecSchema = z.object({
  rubric_ko: z.string(),
});

// bigint 리터럴(`0n`) 대신 BigInt(0) 함수 호출을 쓴다 — 저장소 공용 tsconfig.json의 target이
// ES2017이라 `0n` 문법 자체가 TS2737 에러가 난다(src/lib/sat/spr.ts와 같은 이유·같은 우회).
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);

function gcd(a: bigint, b: bigint): bigint {
  if (a < ZERO) a = -a;
  if (b < ZERO) b = -b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === ZERO ? ONE : a;
}

/**
 * tolerance(일반 숫자, 예: 0.5)를 bigint 유리수로 바꾼다. src/lib/sat/spr.ts의 parseSpr을
 * 그대로 쓰지 않는 이유: 그쪽은 SAT 답안칸 길이 제한(양수 5자)이 있어서 "0.0001" 같은 값이
 * 막힐 수 있다 — 여기서는 그 제한 없이 같은 bigint 기법(분수 기약)만 재사용한다.
 */
function decimalToRational(n: number): Rational {
  if (Number.isInteger(n)) return { n: BigInt(n), d: ONE };
  const s = n.toString();
  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s;
  const dotIdx = unsigned.indexOf(".");
  if (dotIdx === -1) {
    const v = BigInt(unsigned);
    return { n: negative ? -v : v, d: ONE };
  }
  const digits = unsigned.replace(".", "");
  const decimals = unsigned.length - dotIdx - 1;
  let num = BigInt(digits || "0");
  const den = TEN ** BigInt(decimals);
  if (negative) num = -num;
  const g = gcd(num, den);
  return { n: num / g, d: den / g };
}

function stripAllWhitespace(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * "- 3" 같은 부호 뒤 공백만 없앤다. 전체 공백을 없애면 "3 1/2"(대분수, 거부해야 함)가
 * "31/2"(유효한 분수)로 잘못 합쳐져 버리므로, parseSpr이 대분수 패턴을 detect할 수 있게
 * 부호 뒤 공백 말고는 그대로 둔다.
 */
function cleanLeadingSignSpace(s: string): string {
  return s.trim().replace(/^([+-])\s+/, "$1");
}

function gradeMcq(spec: unknown, submitted: string): GradeResult {
  const parsed = McqSpecSchema.safeParse(spec);
  if (!parsed.success) return { correct: false, normalized: submitted.trim(), reason: "invalid_spec" };
  const idx = Number(submitted.trim());
  const correct = Number.isInteger(idx) && idx === parsed.data.correct_index;
  return { correct, normalized: submitted.trim() };
}

function gradeNumeric(spec: unknown, submitted: string): GradeResult {
  const parsed = NumericSpecSchema.safeParse(spec);
  const trimmed = submitted.trim();
  if (!parsed.success) return { correct: false, normalized: trimmed, reason: "invalid_spec" };

  const submittedParsed = parseSpr(cleanLeadingSignSpace(submitted));
  if (!submittedParsed.ok) return { correct: false, normalized: trimmed, reason: submittedParsed.reason };

  // 1) 정답(value) + accept 대체 표기 목록과 정확 일치
  const acceptRawValues = [parsed.data.value, ...parsed.data.accept];
  const exactMatch = acceptRawValues.some((raw) => {
    const r = parseSpr(raw);
    return r.ok && r.value.n === submittedParsed.value.n && r.value.d === submittedParsed.value.d;
  });
  if (exactMatch) return { correct: true, normalized: submittedParsed.canonical };

  // 2) tolerance(허용 오차) — 유리수 교차곱만으로 비교, 부동소수점 비교 없음
  if (parsed.data.tolerance > 0) {
    const target = parseSpr(parsed.data.value);
    if (target.ok) {
      const tol = decimalToRational(parsed.data.tolerance);
      const diffN = submittedParsed.value.n * target.value.d - target.value.n * submittedParsed.value.d;
      const diffD = submittedParsed.value.d * target.value.d; // 두 분모 다 양수라 diffD도 항상 양수
      const withinUpper = diffN * tol.d <= tol.n * diffD;
      const withinLower = -diffN * tol.d <= tol.n * diffD;
      if (withinUpper && withinLower) return { correct: true, normalized: submittedParsed.canonical };
    }
  }

  return { correct: false, normalized: submittedParsed.canonical };
}

function gradeExpression(spec: unknown, submitted: string): GradeResult {
  const parsed = ExpressionSpecSchema.safeParse(spec);
  const trimmed = submitted.trim();
  if (!parsed.success) return { correct: false, normalized: trimmed, reason: "invalid_spec" };
  const normalize = (s: string) => stripAllWhitespace(s).toLowerCase();
  const correct = normalize(submitted) === normalize(parsed.data.canonical);
  return { correct, normalized: trimmed };
}

function gradeFree(spec: unknown, submitted: string): GradeResult {
  const parsed = FreeSpecSchema.safeParse(spec);
  const trimmed = submitted.trim();
  if (!parsed.success) return { correct: false, normalized: trimmed, reason: "invalid_spec" };
  return { correct: false, normalized: trimmed, reason: "manual_required" };
}

export function gradeAnswer(format: AnswerFormat, spec: unknown, submitted: string): GradeResult {
  if (format === "mcq") return gradeMcq(spec, submitted);
  if (format === "numeric") return gradeNumeric(spec, submitted);
  if (format === "expression") return gradeExpression(spec, submitted);
  return gradeFree(spec, submitted);
}
