// 부분점수 계산 시 부동소수점 오차(0.1+0.2 문제)를 피하기 위한 소수점 2자리 반올림.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
