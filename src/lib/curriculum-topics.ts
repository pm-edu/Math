// curriculum_group/curriculum_detail 아래 3번째 단계: 단원(topic) 고정 목록.
// 값은 그대로 problems.unit(text, 기존 자유입력 컬럼)에 저장한다 — DB 변경 없음.
// 키는 curriculum.ts의 CURRICULUM_DETAILS 안의 value와 정확히 일치해야 한다.

export const CURRICULUM_TOPICS: Record<string, string[]> = {
  // ── 한국 · 초등학교 (1·2학기 합침, 중복 제거) ──
  초1: ["9까지의 수", "여러 가지 모양", "덧셈과 뺄셈", "비교하기", "50까지의 수", "100까지의 수", "덧셈과 뺄셈(1)", "덧셈과 뺄셈(2)", "시계 보기와 규칙 찾기", "덧셈과 뺄셈(3)"],
  초2: ["세 자리 수", "여러 가지 도형", "덧셈과 뺄셈", "길이 재기", "분류하기", "곱셈", "네 자리 수", "곱셈구구", "길이 재기와 시각과 시간", "표와 그래프", "규칙 찾기"],
  초3: ["덧셈과 뺄셈", "평면도형", "나눗셈", "곱셈", "길이와 시간", "분수와 소수", "원", "분수", "들이와 무게", "자료의 정리"],
  초4: ["큰 수", "각도", "곱셈과 나눗셈", "평면도형의 이동", "막대그래프와 꺾은선그래프", "규칙 찾기", "분수의 덧셈과 뺄셈", "삼각형", "소수의 덧셈과 뺄셈", "사각형", "꺾은선그래프", "다각형"],
  초5: ["자연수의 혼합 계산", "약수와 배수", "규칙과 대응", "약분과 통분", "분수의 덧셈과 뺄셈", "다각형의 둘레와 넓이", "수의 범위와 어림하기", "분수의 곱셈", "합동과 대칭", "소수의 곱셈", "직육면체", "평균과 가능성"],
  초6: ["분수의 나눗셈", "각기둥과 각뿔", "소수의 나눗셈", "비와 비율", "여러 가지 그래프", "직육면체의 부피와 겉넓이", "공간과 입체", "비례식과 비례배분", "원의 넓이", "원기둥", "원뿔", "구"],

  // ── 한국 · 중학교 (영역명은 버리고 세부항목만) ──
  중1: ["소인수분해", "정수와 유리수", "문자의 사용과 식의 계산", "일차방정식", "좌표평면과 그래프", "기본 도형", "작도와 합동", "다각형", "원과 부채꼴", "다면체와 회전체", "입체도형의 부피와 겉넓이", "자료의 정리와 해석(줄기와 잎, 도수분포표, 상대도수)"],
  중2: ["유리수와 순환소수", "단항식과 다항식의 계산", "일차부등식", "연립일차방정식", "일차함수와 그래프", "일차함수와 일차방정식의 관계", "삼각형과 사각형의 성질", "도형의 닮음", "피타고라스 정리", "경우의 수와 확률"],
  중3: ["제곱근과 실수", "근호를 포함한 식의 계산", "다항식의 곱셈", "다항식의 인수분해", "이차방정식", "이차함수와 그래프", "삼각비와 활용", "원과 직선", "원주각", "대푯값과 산포도", "상관관계"],

  // ── 한국 · 고등학교 ──
  공통수학1: ["다항식", "방정식과 부등식", "경우의 수", "행렬"],
  공통수학2: ["도형의 방정식", "집합과 명제", "함수와 그래프"],
  대수: ["지수함수와 로그함수", "삼각함수", "수열"],
  미적분Ⅰ: ["함수의 극한과 연속", "다항함수의 미분법", "다항함수의 적분법"],
  "확률과 통계": ["경우의 수(순열과 조합)", "확률", "통계(확률분포, 통계적 추정)"],
  기하: ["이차곡선", "평면벡터", "공간도형과 공간좌표"],
  미적분Ⅱ: ["지수함수·로그함수·삼각함수의 미분과 적분", "여러 가지 미분법", "여러 가지 적분법"],
  "경제 수학": ["수와 생활 경제", "수열과 금융", "함수와 그래프의 경제 활용", "미분과 경제"],
  "인공지능 수학": ["인공지능과 수학", "자료의 표현", "분류와 예측", "최적화"],
  "실용 통계": ["통계와 통계적 문제해결", "자료의 수집과 정리", "자료의 분석"],
  "수학과제 탐구": ["과제 설정", "탐구 수행", "결과 발표"],

  // ── IB DP (SL=기본 항목, HL=기본+심화 항목) ──
  IB_AA_SL: [
    "수열과 급수", "지수와 로그", "이항정리",
    "함수의 개념과 그래프", "합성함수와 역함수", "다항함수",
    "삼각비와 삼각함수", "사인법칙·코사인법칙",
    "자료의 표현", "상관관계와 회귀", "확률", "이산확률분포",
    "극한과 미분", "미분법의 응용", "적분법",
  ],
  IB_AA_HL: [
    "수열과 급수", "지수와 로그", "이항정리", "복소수", "행렬", "수학적 귀납법",
    "함수의 개념과 그래프", "합성함수와 역함수", "다항함수", "함수의 변환 심화",
    "삼각비와 삼각함수", "사인법칙·코사인법칙", "벡터", "3차원 벡터의 응용",
    "자료의 표현", "상관관계와 회귀", "확률", "이산확률분포", "정규분포 심화", "베이즈 정리",
    "극한과 미분", "미분법의 응용", "적분법", "미분방정식", "매클로린 급수",
  ],
  IB_AI_SL: [
    "수와 표기", "수열과 급수(금융 응용 포함)", "이항정리",
    "함수의 모델링(선형·이차·지수·로그·삼각함수 모델)",
    "부피와 표면적", "삼각비", "벡터 응용",
    "자료 수집과 표현", "상관관계", "확률분포(이항·정규)", "가설검정",
    "미분의 개념과 응용(최적화)", "적분(넓이 계산)",
  ],
  IB_AI_HL: [
    "수와 표기", "수열과 급수(금융 응용 포함)", "이항정리", "복소수 기초",
    "함수의 모델링(선형·이차·지수·로그·삼각함수 모델)", "함수 모델링 심화",
    "부피와 표면적", "삼각비", "벡터 응용", "벡터의 외적", "평면과 직선의 방정식",
    "자료 수집과 표현", "상관관계", "확률분포(이항·정규)", "가설검정", "카이제곱 검정", "스피어만 상관계수",
    "미분의 개념과 응용(최적화)", "적분(넓이 계산)", "미분방정식의 모델링", "수치해석적 근사",
  ],

  // ── IGCSE (0607/0580 공통, 0607은 코스워크 탐구 추가) ──
  IGCSE_0580: [
    "자연수/정수/유리수/무리수", "비와 비율", "백분율", "표준형(지수 표기)", "극한과 근사",
    "식의 전개와 인수분해", "방정식(일차·이차·연립)", "부등식", "함수와 그래프", "수열",
    "각과 다각형의 성질", "합동과 닮음", "원의 성질", "작도",
    "둘레·넓이·부피", "호의 길이와 부채꼴의 넓이", "입체도형의 겉넓이와 부피",
    "직선의 방정식", "기울기와 절편", "두 점 사이의 거리",
    "삼각비", "사인법칙·코사인법칙", "입체도형에서의 삼각비 활용",
    "벡터의 표현과 연산", "평행이동·회전·확대·반사",
    "단순확률", "조건부확률", "트리 다이어그램",
    "대푯값(평균·중앙값·최빈값)", "산포도", "도수분포표와 히스토그램", "누적도수그래프",
  ],
  IGCSE_0607: [
    "자연수/정수/유리수/무리수", "비와 비율", "백분율", "표준형(지수 표기)", "극한과 근사",
    "식의 전개와 인수분해", "방정식(일차·이차·연립)", "부등식", "함수와 그래프", "수열",
    "각과 다각형의 성질", "합동과 닮음", "원의 성질", "작도",
    "둘레·넓이·부피", "호의 길이와 부채꼴의 넓이", "입체도형의 겉넓이와 부피",
    "직선의 방정식", "기울기와 절편", "두 점 사이의 거리",
    "삼각비", "사인법칙·코사인법칙", "입체도형에서의 삼각비 활용",
    "벡터의 표현과 연산", "평행이동·회전·확대·반사",
    "단순확률", "조건부확률", "트리 다이어그램",
    "대푯값(평균·중앙값·최빈값)", "산포도", "도수분포표와 히스토그램", "누적도수그래프",
    "탐구 과제(코스워크)",
  ],

  // ── CBSE ── (Class1~8은 사용자 지시대로 대분류 요약을 그대로 재사용)
  CBSE_Class1: ["수 개념", "사칙연산 기초", "도형 인식", "측정(길이·무게·시간)", "자료 다루기 기초"],
  CBSE_Class2: ["수 개념", "사칙연산 기초", "도형 인식", "측정(길이·무게·시간)", "자료 다루기 기초"],
  CBSE_Class3: ["수 개념", "사칙연산 기초", "도형 인식", "측정(길이·무게·시간)", "자료 다루기 기초"],
  CBSE_Class4: ["수 개념", "사칙연산 기초", "도형 인식", "측정(길이·무게·시간)", "자료 다루기 기초"],
  CBSE_Class5: ["수 개념", "사칙연산 기초", "도형 인식", "측정(길이·무게·시간)", "자료 다루기 기초"],
  CBSE_Class6: ["정수", "분수와 소수", "대수 기초(문자식)", "비와 비율", "기본 도형과 각", "넓이·부피", "자료의 표현(그래프)", "백분율"],
  CBSE_Class7: ["정수", "분수와 소수", "대수 기초(문자식)", "비와 비율", "기본 도형과 각", "넓이·부피", "자료의 표현(그래프)", "백분율"],
  CBSE_Class8: ["정수", "분수와 소수", "대수 기초(문자식)", "비와 비율", "기본 도형과 각", "넓이·부피", "자료의 표현(그래프)", "백분율"],
  CBSE_Class9: [
    "Number Systems", "Polynomials", "Coordinate Geometry", "Linear Equations in Two Variables",
    "Introduction to Euclid's Geometry", "Lines and Angles", "Triangles", "Quadrilaterals",
    "Areas of Parallelograms and Triangles", "Circles", "Constructions", "Heron's Formula",
    "Surface Areas and Volumes", "Statistics", "Probability",
  ],
  CBSE_Class10: [
    "Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations",
    "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Introduction to Trigonometry",
    "Applications of Trigonometry", "Circles", "Areas Related to Circles", "Surface Areas and Volumes",
    "Statistics", "Probability",
  ],
  CBSE_Class11_Maths: [
    "Sets", "Relations and Functions", "Trigonometric Functions", "Principle of Mathematical Induction",
    "Complex Numbers and Quadratic Equations", "Linear Inequalities", "Permutations and Combinations",
    "Binomial Theorem", "Sequences and Series", "Straight Lines", "Conic Sections",
    "Introduction to Three Dimensional Geometry", "Limits and Derivatives", "Statistics", "Probability",
  ],
  CBSE_Class11_AppliedMaths: [
    "Numbers Quantification and Numerical Applications", "Algebra", "Coordinate Geometry",
    "Mathematical Reasoning", "Calculus (기초 미분)", "Probability Distributions",
    "Descriptive Statistics", "Basics of Financial Mathematics", "Basics of Computer and Logical Reasoning",
  ],
  CBSE_Class12_Maths: [
    "Relations and Functions", "Inverse Trigonometric Functions", "Matrices", "Determinants",
    "Continuity and Differentiability", "Applications of Derivatives", "Integrals", "Applications of Integrals",
    "Differential Equations", "Vector Algebra", "Three Dimensional Geometry", "Linear Programming", "Probability",
  ],
  CBSE_Class12_AppliedMaths: [
    "Numbers Quantification and Numerical Applications", "Algebra", "Calculus", "Probability Distributions",
    "Inferential Statistics", "Index Numbers and Time-Based Data", "Financial Mathematics", "Linear Programming",
  ],

  // ── AS / A-Level (Cambridge 9709) ──
  AS_A_Level_P1: ["Quadratics", "Functions", "Coordinate Geometry", "Circular Measure", "Trigonometry", "Series (이항정리·등차등비수열)", "Differentiation", "Integration"],
  AS_A_Level_P2: ["Algebra(대수 심화: 나머지정리·인수정리)", "Logarithmic and Exponential Functions", "Trigonometry 심화", "Differentiation 심화", "Integration 심화(수치적분 포함)"],
  AS_A_Level_P3: ["Algebra 심화", "Logarithmic and Exponential Functions 심화", "Trigonometry 심화", "Differentiation 심화(음함수·매개변수 미분)", "Integration 심화", "Numerical Solution of Equations", "Vectors", "Differential Equations"],
  AS_A_Level_M1: ["Forces and Equilibrium", "Kinematics of Motion in a Straight Line", "Momentum", "Newton's Laws of Motion", "Energy, Work and Power"],
  AS_A_Level_S1: ["Representation of Data", "Permutations and Combinations", "Probability", "Discrete Random Variables", "The Normal Distribution"],
  AS_A_Level_S2: ["The Poisson Distribution", "Linear Combinations of Random Variables", "Continuous Random Variables", "Sampling and Estimation", "Hypothesis Tests"],
};

export function topicsFor(curriculumDetail: string | null | undefined): string[] {
  if (!curriculumDetail) return [];
  return CURRICULUM_TOPICS[curriculumDetail] ?? [];
}
