// 답 비교용 정규화: 공백 제거 + 소문자 (③ vs ③, x = 2 vs x=2 등 가벼운 차이 흡수)
export function normAnswer(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, "").toLowerCase();
}
