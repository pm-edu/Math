# AI 프롬프트 (Stage 6)

영어 단어 서브시스템에서 쓰는 AI 프롬프트를 용도별 파일로 분리해서 둔다.
모든 AI 호출은 **서버 사이드에서만** 한다(API 라우트/서버 액션). 클라이언트에서 직접 호출 금지.

## 제공자 방침

- 대량 생성(단어·예문·문항 초안): **Gemini** (`gemini-flash-latest`) — 비용 우선, 기존 problems/SAT 생성과 동일 패턴
- 고급 채점(SENTENCE_WRITE 루브릭 채점, 리라이팅 피드백): **Claude API** — 정확도 우선

## 예정 파일 (Stage 6에서 작성)

- `word-generation.ts` — 단어·뜻·영영정의·예문 생성 (기존 generate-words 프롬프트를 이 구조로 이전)
- `sentence-grading.ts` — 학생 작문 루브릭 채점(①용법 정확성 ②연어 자연스러움 ③문법) + 리라이팅
- `personalized-example.ts` — 학생 프로필(관심사·목표시험) 맞춤 예문 생성

## 캐싱 · 비용 가드

- 생성 결과는 `ai_generations` 테이블에 `input_hash` 기준 캐싱해 같은 요청 재과금 방지 (Stage 1 스키마에 포함)
- 학생 1인당 하루 상한(초안): 문장 작문 채점 20회, 맞춤 예문 30개. 초과 시 규칙 채점/기본 예문으로 폴백.
