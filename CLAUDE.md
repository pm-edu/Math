# PM EDU (pmedu4u.com) — 프로젝트 지침

수학·영어 교육 서비스 사이트. Next.js 16(App Router) + TypeScript(strict) + Tailwind 4 +
Supabase(Auth/DB/Storage, RLS) + Vercel. 배포는 GitHub main 푸시 → Vercel 자동 재배포.

이 문서는 두 부분으로 나뉜다: **[기존 사이트]** 는 이미 동작 중인 수학/공통 부분의 실제
아키텍처를 있는 그대로 기록한 것이고, **[영어 서브시스템]** 은 새로 구축 중인 완전학습
엔진의 규칙·용어사전이다. 서로 패턴이 다를 수 있다 — 아래에 각각 명시한다.

@AGENTS.md

---

## [기존 사이트] 아키텍처 (수학·공통 — 있는 그대로)

- **화면은 대부분 클라이언트 컴포넌트다** (`"use client"`). 브라우저에서 `@/lib/supabase/client`로
  Supabase를 직접 호출하고, 접근 제어는 **RLS(행 단위 보안 정책)** 가 담당한다. 화면의 역할 체크는
  UX용 안내일 뿐, 진짜 방어선은 항상 DB의 RLS다.
- **권한 5단계**: `owner > admin > teacher > assistant > student`. 판별 함수는 `src/lib/roles.ts`
  (`isStaff`, `canManageSite`, `canManageMaterials`, `canManageStudents`, `canAssignRoles`).
  DB 쪽 대응 함수는 `is_admin()`(owner+admin), `is_staff()`(owner+admin+teacher+assistant) —
  `supabase/roles-tier.sql`에 정의. 역할 변경은 `set_user_role()` RPC로만 가능(직접 UPDATE 차단).
- **과목 전환**: `src/lib/subject.tsx`의 `useSubject()`가 쿠키+localStorage로 수학/영어를 관리.
  헤더의 [수학|영어] 토글이 이걸 바꾼다.
- **다국어**: `src/lib/i18n.tsx`의 자체 경량 방식(`useLang`, `DICT` 상수, 쿠키 저장). next-intl 같은
  라이브러리는 쓰지 않는다. **영어 서브시스템도 이 방식을 그대로 따른다** (아래 참고).
- **SQL은 평면 파일**: `supabase/*.sql`이 "여러 번 실행해도 안전한(idempotent)" 스냅샷 방식.
  기존 파일은 이 방식을 유지하고 손대지 않는다.
- **AI 호출은 전부 서버 라우트에서만** (`src/app/api/*/route.ts`), 클라이언트에서 직접 API 키를
  쓰지 않는다. 문제 추출·SAT 생성 등은 Gemini(`gemini-flash-latest`).
- **검수 원칙**: AI가 생성한 콘텐츠(문제 정답·풀이·SAT 문항 등)는 `verified` 플래그가 있고,
  관리자가 화면에서 저장 버튼을 눌러야만 `verified=true`가 되어 학생에게 노출된다. RLS도 이
  플래그를 검사한다. **이 원칙은 영어 서브시스템에도 그대로 적용한다.**

---

## [영어 서브시스템] 완전학습 단어 엔진

pmedu4u 사이트 **안의 독립 서브시스템**으로 구축한다(별도 도메인/앱 아님). 기존 로그인·권한·
헤더는 재사용하고, 라우트는 `/english/...` 아래로 네임스페이스를 둔다.

**기존 Leitner 방식 단어 기능(어제 만든 `words`/`word_progress`/`word_decks`, `/admin/words`,
`/vocab`)은 폐기하고 아래 설계로 교체한다.** 학생 데이터가 쌓이기 전이라 마이그레이션이 아니라
교체(재작성)로 진행한다. (`words` 테이블의 씨앗 데이터는 재활용 가능)

### 핵심 원칙

1. **"안다"는 자기보고 상태가 없다.** 모든 승급은 채점 가능한 수행으로만 이뤄진다. 학생이
   스스로 "알아요"를 누르는 방식은 기본 흐름에 없다.
2. **어휘 지식은 사다리다.** 인지 → 회상 → 생산 → 자동화 순으로 올라간다.
3. **90% 게이트.** 유닛 통과 기준 미달이면 다음 유닛 잠금 해제 안 됨. 대신 교정학습(corrective
   loop)으로 통과할 때까지 다시 가르친다. 탈락시키지 않는다.
4. **오답은 데이터다.** 어떤 오답을 골랐는지, 반응시간이 얼마인지 기록해 다음 출제에 반영한다.
5. **FSRS(언제 복습할지)와 사다리(그 순간 어떤 문항을 낼지)는 직교(orthogonal)한 두 축이다.**
   섞어서 설계하지 않는다.

### 용어 사전

| 용어 | 의미 |
|---|---|
| **Mastery Level (Lv0~5)** | 0=미학습, 1=인지(Recognition), 2=회상(Recall), 3=생산(Production), 4=자동화(Fluency), 5=완전습득(Mastered, 21일+ 간격 재인출 성공) |
| **승급 규칙** | 같은 레벨에서 서로 다른 세션 3회 연속 정답 시 +1. 같은 세션 내 같은 문항유형 연속승급 금지 |
| **강등 규칙** | 오답 시 -1, 2연속 오답 시 -2 (최저 1) |
| **FSRS** | Free Spaced Repetition Scheduler — stability/difficulty로 "다음 복습 시각"을 계산하는 간격반복 알고리즘. rating(again/hard/good/easy)은 학생이 아니라 **채점 결과+반응시간에서 자동 산출** |
| **90% 게이트** | 유닛 단어 90%+ Lv3 이상 AND 유닛 종합평가(20문항) 90점 이상 → 통과 |
| **교정학습(corrective loop)** | 게이트 미통과 시, 틀린 단어만 **이전과 다른 문항 유형**으로 재학습→재평가. 최대 3사이클, 이후 "집중관리 단어" 태깅 |
| **혼동쌍(Confusion Pair)** | 오답 로그에서 반복 혼동되는 단어쌍(예: affect/effect)을 탐지해 CONTRAST 문항으로 대조 학습시킴. 콜드스타트는 시드된 알려진 혼동쌍으로 1일차부터 작동 |
| **문항 유형 코드** | `EN_KO_MC`(영→한 4지선다,Lv1) · `AUDIO_MC`(듣고 고르기,Lv1) · `KO_EN_TYPE`(뜻보고 타이핑,Lv2) · `DICTATION`(받아쓰기,Lv2) · `CLOZE`(빈칸,Lv3) · `COLLOCATION`(연어짝,Lv3) · `SENTENCE_WRITE`(작문,AI채점,Lv3) · `SPEED_ROUND`(속도,Lv4,MVP이후) · `SHADOWING`(발음,**채점 없는 연습**,Lv4,MVP이후) · `CONTRAST`(대조,전레벨) |
| **AI 제공자 방침** | 대량 생성(단어·예문)=Gemini(비용우선), 고급 채점(작문 루브릭)=Claude API(정확도우선) |

### MVP 범위 (지금 만드는 것)

Lv1~3 문항 + 자동 rating FSRS + 90% 게이트+교정루프 + 시드 혼동쌍 + 교사 단어장 빌더+검수.
**SENTENCE_WRITE AI채점은 MVP에 포함**(질문 4에서 확정), SPEED_ROUND·SHADOWING·어원지식그래프·
맞춤예문·PWA·오프라인은 MVP 이후.

### 비용 가드 (기본값, 조정 가능)

학생 1인당 하루: 문장 작문 AI 채점 20회, 맞춤 예문 30개. 초과 시 규칙 채점/기본 예문으로 폴백.

---

## [TOEFL 서브시스템]

TOEFL 관련 작업은 반드시 `docs/toefl-spec.md`를 먼저 읽고 시작할 것. 스키마는 `supabase/migrations/`
(202608151200~1203, P0 완료분). AI는 이 프로젝트 관례대로 Gemini만 쓴다(스펙 원문의 Claude/Whisper/
ElevenLabs 가정은 실제 프로젝트와 안 맞아 Gemini로 대체하기로 확정함 — 필요해지면 나중에 전문
서비스로 업그레이드). 유료화(D6)는 결제 연동 전까지 보류. Phase(P0~P6)는 한 번에 하나씩만 진행하고
끝날 때마다 보고 후 승인을 기다린다(공통 작업 규칙과 동일 원칙).

---

## 교차검증 절차

(1) `/review-pack 기능명` 실행 → (2) `review/` 폴더에 생성된 파일을 외부 AI(ChatGPT 등)에 업로드
→ (3) `review/REVIEW_PROMPT.md` 내용을 함께 붙여넣기.

---

## 공통 작업 규칙

**해야 할 것**
- 코드를 쓰기 전에 관련 기존 파일을 먼저 읽는다.
- 학습 엔진(`src/lib/engine/`)은 UI·Supabase와 분리된 순수 함수로만 작성한다. 로직을 쓰기 전에
  `src/**/*.test.ts`에 vitest 단위 테스트를 먼저 쓴다 (`npm test`로 실행).
- 새 스키마 변경은 `supabase/migrations/YYYYMMDDHHMM_설명.sql` (규칙: `supabase/migrations/README.md`).
  기존 평면 `.sql` 파일은 건드리지 않는다.
- 서버 액션/API 라우트의 입출력은 zod 스키마로 검증한다.
- 새 라이브러리를 추가할 땐 이유와 대안을 한 줄로 먼저 말한다.
- 불확실하면 추측하지 말고 질문한다(한 번에 최대 5개로 모아서).
- 커밋은 작게, 메시지는 한국어로 무엇을·왜.

**하지 말 것**
- `any` 타입, 불필요한 타입 단언
- RLS 없는 테이블 생성
- 클라이언트에서 AI API 직접 호출 / API 키 노출
- 기존 인증·과금·수학 문제은행·강좌 코드를 임의로 리팩터링
- 여러 Stage(단계)를 한 번에 진행 — 각 Stage 끝나면 보고하고 승인을 기다린다
