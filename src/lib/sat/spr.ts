// SAT SPR(Student-Produced Response) 정규화. 순수 함수만 — DB·네트워크·전역 상태 접근 금지.
//
// 부동소수점으로 답을 비교하지 않는다(0.1 + 0.2 !== 0.3 문제). 분자·분모 정수쌍(Rational)으로만 다룬다.
//
// bigint 리터럴(`0n`) 대신 BigInt(0) 함수 호출을 쓴다 — 저장소 공용 tsconfig.json의
// target이 ES2017이라 `0n` 문법 자체가 TS2737 에러가 난다(target 변경은 이번 작업 범위 밖).
// BigInt(0)은 일반 함수 호출이라 target과 무관하게 항상 통과한다.

export interface Rational {
  n: bigint; // 분자 (부호 포함)
  d: bigint; // 분모 (항상 > 0, 기약형)
}

export type SprErrorCode =
  | "EMPTY"
  | "INVALID_LENGTH"
  | "INVALID_CHAR"
  | "MIXED_NUMBER_NOT_ALLOWED"
  | "DIVISION_BY_ZERO";

export type SprParseResult =
  | { ok: true; value: Rational; canonical: string }
  | { ok: false; reason: SprErrorCode };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

function gcd(a: bigint, b: bigint): bigint {
  if (a < ZERO) a = -a;
  if (b < ZERO) b = -b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === ZERO ? ONE : a;
}

function reduce(n: bigint, d: bigint): Rational {
  if (d < ZERO) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function canonicalOf(r: Rational): string {
  return r.d === ONE ? `${r.n}` : `${r.n}/${r.d}`;
}

const INVALID_CHAR_PATTERN = /[,%$π√]/;
const MIXED_NUMBER_PATTERN = /^-?\d+\s+\d+\/\d+$/;
const FRACTION_PATTERN = /^(-?\d+)\/(\d+)$/;
const DECIMAL_PATTERN = /^-?\d*\.?\d*$/;

/**
 * 정규화 절차: 공백 제거 → NFKC 정규화 → 문자·길이 검증 → 분수/소수 파싱 → Rational 반환.
 * 오류는 예외가 아니라 판별 유니온으로 반환한다.
 */
export function parseSpr(raw: string): SprParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "EMPTY" };

  const s = trimmed.normalize("NFKC");

  const isNegative = s.startsWith("-");
  const maxLen = isNegative ? 6 : 5; // 양수 5자, 음수 6자
  if (s.length > maxLen) return { ok: false, reason: "INVALID_LENGTH" };

  if (INVALID_CHAR_PATTERN.test(s)) return { ok: false, reason: "INVALID_CHAR" };
  if (MIXED_NUMBER_PATTERN.test(s)) return { ok: false, reason: "MIXED_NUMBER_NOT_ALLOWED" };

  const fractionMatch = FRACTION_PATTERN.exec(s);
  if (fractionMatch) {
    const n = BigInt(fractionMatch[1]);
    const d = BigInt(fractionMatch[2]);
    if (d === ZERO) return { ok: false, reason: "DIVISION_BY_ZERO" };
    const value = reduce(n, d);
    return { ok: true, value, canonical: canonicalOf(value) };
  }

  if (s.includes("/")) return { ok: false, reason: "INVALID_CHAR" }; // 형식이 안 맞는 분수(예: "1/2/3")

  if (!DECIMAL_PATTERN.test(s) || !/\d/.test(s)) return { ok: false, reason: "INVALID_CHAR" };

  const unsigned = isNegative ? s.slice(1) : s;
  const dotIndex = unsigned.indexOf(".");
  const intPart = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex) || "0";
  const fracPart = dotIndex === -1 ? "" : unsigned.slice(dotIndex + 1);

  let n = BigInt(intPart + fracPart || "0");
  const d = TEN ** BigInt(fracPart.length);
  if (isNegative) n = -n;

  const value = reduce(n, d);
  return { ok: true, value, canonical: canonicalOf(value) };
}

function rationalEquals(a: Rational, b: Rational): boolean {
  return a.n === b.n && a.d === b.d;
}

function truncateToDecimalPlaces(r: Rational, places: number): Rational {
  const scale = TEN ** BigInt(places);
  const scaled = (r.n * scale) / r.d; // bigint 나눗셈은 0 방향으로 절사된다 — 원하는 동작 그대로.
  return reduce(scaled, scale);
}

function roundToDecimalPlaces(r: Rational, places: number): Rational {
  const scale = TEN ** BigInt(places);
  const num = r.n * scale;
  const sign = num < ZERO ? -ONE : ONE;
  const absNum = num < ZERO ? -num : num;
  // half-up 반올림: (|num| + d/2) / d 를 정수 나눗셈(절사)으로 계산하면 반올림이 된다.
  const q = (absNum * TWO + r.d) / (r.d * TWO);
  return reduce(sign * q, scale);
}

/**
 * "칸을 다 채운 절사·반올림만 정답" 판정 — 별도 함수로 분리(지시서 SAT P0 §3).
 *
 * 실제 SAT SPR 채점 규칙: 무한/장자릿수 소수 정답에 한해, 학생이 입력칸을 "끝까지 채운"
 * 절사값 또는 반올림값만 정답으로 인정한다. 예: 정답이 1/3이면 "0.333"(칸을 다 채움)은
 * 정답이지만 "0.33"(칸이 남는데 짧게 씀)은 오답 — 짧은 소수가 우연히 가까운 근사인지
 * 학생이 정말 그 값을 의도한 것인지 구분할 수 없기 때문에, 실제 시험도 이렇게 채점한다.
 * "칸을 다 채웠다"는 입력 문자열 길이가 §3 길이 규칙의 최대치(양수 5자/음수 6자)와
 * 정확히 같은지로 판단한다 — 문항마다 다른 입력칸 폭 정보가 없으므로 이 전역 규칙을 쓴다.
 * 분수 형태 입력에는 이 규칙을 적용하지 않는다(분수는 절사할 "자리수" 개념이 없다).
 */
function isFullyFilledTruncationOrRounding(rawNormalized: string, inputValue: Rational, key: Rational): boolean {
  if (!rawNormalized.includes(".") || rawNormalized.includes("/")) return false;

  const isNegative = rawNormalized.startsWith("-");
  const maxLen = isNegative ? 6 : 5;
  if (rawNormalized.length !== maxLen) return false;

  const dotIndex = rawNormalized.indexOf(".");
  const decimalPlaces = rawNormalized.length - dotIndex - 1;
  if (decimalPlaces <= 0) return false;

  const truncated = truncateToDecimalPlaces(key, decimalPlaces);
  const rounded = roundToDecimalPlaces(key, decimalPlaces);
  return rationalEquals(inputValue, truncated) || rationalEquals(inputValue, rounded);
}

/** 학생 입력(raw)이 정답 키 하나(key)와 일치하는지 판정. §3 필수 테스트 케이스 표 그대로 구현. */
export function isSprCorrect(inputRaw: string, key: Rational): boolean {
  const parsed = parseSpr(inputRaw);
  if (!parsed.ok) return false;
  if (rationalEquals(parsed.value, key)) return true;

  const normalized = inputRaw.trim().normalize("NFKC");
  return isFullyFilledTruncationOrRounding(normalized, parsed.value, key);
}
