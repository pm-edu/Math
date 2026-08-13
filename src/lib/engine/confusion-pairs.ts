// 혼동쌍 탐지(Confusion Pair Detection) — 이 제품의 시그니처 기능.
// 오답 선택지 로그로 학생별 혼동 행렬을 만들어 반복 혼동되는 쌍(예: affect/effect)을 찾고,
// CONTRAST(대조) 문항을 자동 삽입한다.
//
// 콜드스타트 대응: 신규 학생은 이력이 0이므로, 시드된 알려진 혼동쌍(affect/effect류)으로
// 1일차부터 CONTRAST 문항이 나가도록 한다. 개인화 혼동쌍은 데이터가 쌓이면 우선한다.
//
// TODO(Stage 7): 탐지 로직 + 시드 데이터 연동.

export {};
