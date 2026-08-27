# TOEFL 4개 영역 모듈 — Claude Code 구현 지시서 v1

> **대상 스택**: Next.js (App Router) + Supabase (Postgres/Auth/Storage) + Vercel
> **작성 목적**: Claude Code에 그대로 투입할 수 있는 단일 진실 원본(SSOT). 이 문서를 `docs/toefl-spec.md`로 커밋하고, 각 Phase 프롬프트에서 이 파일을 참조시킨다.

---

## 0. 이 문서 사용법

1. 이 파일을 리포지토리 `docs/toefl-spec.md`에 저장한다.
2. `CLAUDE.md`에 한 줄 추가: `TOEFL 관련 작업은 반드시 docs/toefl-spec.md를 먼저 읽고 시작할 것.`
3. §16의 Phase별 프롬프트를 **한 번에 하나씩** Claude Code에 붙여넣는다. 4개 영역을 한 프롬프트로 요청하지 않는다 (컨텍스트 붕괴 + 스키마 표류 발생).
4. §1의 미결정 항목을 먼저 확정한 뒤 Phase 1을 시작한다.

---

## 1. 착수 전 확정할 결정 사항

| # | 결정 항목 | 기본값(제안) | 영향 범위 |
|---|---|---|---|
| D1 | 기존 어휘 사이트에 편입 vs 독립 앱 | **기존 사이트 내 `/toefl` 네임스페이스** (auth·결제·FSRS 재사용) | 전체 |
| D2 | 2026 개편 포맷 vs 구(舊) 포맷 | **2026 개편 포맷 전용** (§2 참조) | 스키마·UI 전부 |
| D3 | Speaking 채점 방식 | STT(Whisper 계열) + Claude 루브릭 | Phase 4 |
| D4 | 오디오 소스 | TTS 생성(ElevenLabs/Clova) + 사전 렌더링 후 Storage 저장 | Phase 2 |
| D5 | 적응형 라우팅 구현 여부 | **MVP에서 구현** (2026 포맷의 핵심 특징) | Phase 1 |
| D6 | 무료/유료 게이팅 | 모의고사 1세트 무료, 이후 유료 | Phase 5 |

**저작권 경고 (필수 준수)**: ETS 실제 문항·지문·오디오는 어떤 형태로도 DB에 넣지 않는다. 전부 자체 제작/AI 생성 문항만 사용한다. UI에는 `TOEFL®은 ETS의 등록상표이며 본 서비스는 ETS의 승인·제휴 관계가 없습니다` 고지를 푸터에 넣는다.

---

## 2. 반드시 반영할 사실 — 2026년 1월 개편

기존 TOEFL 자료(2025년 이전)로 만들면 **구조 자체가 틀린 제품**이 된다. 2026년 1월 21일부터 적용된 포맷:

| 항목 | 구 포맷 | 2026 포맷 |
|---|---|---|
| 총 시간 | 약 2시간 | **약 90분**, 휴식 없음 |
| 영역 순서 | R → L → S → W | **R → L → S → W (고정)** |
| 적응형 | 없음 | **Reading/Listening 2단계 적응형(Stage1 → Stage2)** |
| 점수 | 0–120 | **1.0–6.0 밴드(0.5 단위)** + 0–30 영역점수 + 0–120 총점 병기 |
| Reading | 지문 2개 MCQ | Complete the Words / Daily Life / Academic Passages |
| Listening | 대화·강의 | Choose a Response / Conversations / Announcements / Academic Talks |
| Speaking | Independent 1 + Integrated 3 | **Listen and Repeat + Take an Interview(3턴)** — 통합형 폐지 |
| Writing | Integrated + Independent 에세이 | **Build a Sentence + Write an Email + Academic Discussion** |

**시간·문항 수 수치는 출처마다 편차가 있다(예: Reading 30분 vs 35분, Speaking 8분 vs 16분).**
→ 따라서 **시간·문항 수를 코드에 하드코딩하지 말 것.** 전부 `toefl_form_blueprint` 테이블에서 읽어오게 설계한다. ETS 공식 Blueprint 확인 후 시드 데이터만 교체하면 되도록 만든다. 이건 선택이 아니라 필수 요구사항이다.

---

## 3. 스코프

### In scope (v1)
- 4개 영역 전체 문항 뱅크 + 응시 엔진 + 자동/AI 채점 + 성적 리포트
- Stage1 → Stage2 적응형 라우팅 (Reading/Listening)
- 영역별 단독 연습 모드 + 풀 모의고사 모드
- 관리자 문항 등록/검수 UI

### Out of scope (v1)
- 실시간 프록터링, 부정행위 감지
- 인간 채점자 워크플로
- 모바일 네이티브 앱
- 결제 연동 (법인 결정 대기 — 기존 방침 유지)

---

## 4. 도메인 모델 & 용어 (고정 용어집)

코드·DB·UI 전부 이 용어만 사용한다. 동의어 금지.

- **form** — 하나의 완결된 시험 세트(모의고사 1회분)
- **section** — reading / listening / speaking / writing
- **module** — 한 section 안의 Stage1 또는 Stage2 블록. 라우팅 단위
- **stimulus** — 지문·오디오·이메일 프롬프트 등 문항이 물려 있는 자료
- **item** — 채점 단위 문항 1개
- **task_type** — 12종 과제 유형 (§6)
- **attempt** — 학생의 1회 응시
- **response** — item 1개에 대한 학생 답안
- **scaled score** — 0–30, **band** — 1.0–6.0

---

## 5. DB 스키마 (Supabase / Postgres DDL)

```sql
-- ============ ENUMS ============
create type toefl_section as enum ('reading','listening','speaking','writing');
create type toefl_task_type as enum (
  -- reading
  'complete_the_words','daily_life','academic_passage',
  -- listening
  'choose_a_response','conversation','announcement','academic_talk',
  -- speaking
  'listen_and_repeat','take_an_interview',
  -- writing
  'build_a_sentence','write_an_email','academic_discussion'
);
create type toefl_stage       as enum ('stage1','stage2');
create type toefl_route       as enum ('base','easy','hard');
create type toefl_scoring_mode as enum ('auto_key','auto_sequence','auto_transcript','ai_rubric');
create type toefl_attempt_status as enum ('in_progress','submitted','scored','abandoned');

-- ============ 블루프린트 (시간·문항수 = 데이터, 코드 아님) ============
create table toefl_form_blueprint (
  id            uuid primary key default gen_random_uuid(),
  version       text not null,              -- 'ETS-2026-04'
  section       toefl_section not null,
  stage         toefl_stage not null,
  route         toefl_route not null,
  time_limit_sec int not null,
  item_count    int not null,
  task_mix      jsonb not null,             -- {"complete_the_words":6,"daily_life":5,...}
  is_active     boolean not null default true,
  unique (version, section, stage, route)
);

-- ============ 콘텐츠 ============
create table toefl_form (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,          -- 'TOEFL_FORM_001'
  title       text not null,
  blueprint_version text not null,
  is_published boolean not null default false,
  created_at  timestamptz default now()
);

create table toefl_module (
  id        uuid primary key default gen_random_uuid(),
  form_id   uuid not null references toefl_form(id) on delete cascade,
  section   toefl_section not null,
  stage     toefl_stage not null,
  route     toefl_route not null,
  position  int not null,
  unique (form_id, section, stage, route)
);

create table toefl_stimulus (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references toefl_module(id) on delete cascade,
  task_type   toefl_task_type not null,
  title       text,
  body        text,                          -- 지문 원문 (markdown)
  audio_path  text,                          -- Storage key, listening/speaking 전용
  transcript  text,                          -- 오디오 스크립트 (해설·검색용)
  audio_duration_sec int,
  image_path  text,                          -- 강의 시각자료
  position    int not null,
  metadata    jsonb default '{}'::jsonb      -- {"word_count":640,"topic":"biology","cefr":"B2"}
);

create table toefl_item (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references toefl_module(id) on delete cascade,
  stimulus_id   uuid references toefl_stimulus(id) on delete cascade,
  task_type     toefl_task_type not null,
  position      int not null,
  difficulty    smallint not null check (difficulty between 1 and 5),
  points        numeric(4,2) not null default 1,
  scoring_mode  toefl_scoring_mode not null,
  prompt        text not null,
  payload       jsonb not null,              -- 유형별 구조: §6
  answer_key    jsonb,                       -- ai_rubric이면 null 허용
  explanation_ko text,                       -- 한국어 해설 (필수)
  explanation_en text,
  skill_tags    text[] default '{}',         -- {'inference','vocab_in_context'}
  vocab_ids     uuid[] default '{}',         -- 기존 어휘 DB 연동 (§13)
  created_at    timestamptz default now()
);
create index on toefl_item (module_id, position);
create index on toefl_item using gin (skill_tags);

-- ============ 응시 ============
create table toefl_attempt (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  form_id     uuid not null references toefl_form(id),
  mode        text not null check (mode in ('full','section_practice')),
  status      toefl_attempt_status not null default 'in_progress',
  started_at  timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at   timestamptz
);
create index on toefl_attempt (user_id, started_at desc);

create table toefl_section_attempt (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references toefl_attempt(id) on delete cascade,
  section       toefl_section not null,
  started_at    timestamptz,
  deadline_at   timestamptz,                 -- 서버 권위 타이머 (§11)
  finished_at   timestamptz,
  stage1_raw    numeric(6,2),
  routed_to     toefl_route,                 -- stage2 라우팅 결과
  raw_score     numeric(6,2),
  scaled_score  smallint,                    -- 0-30
  band          numeric(2,1),                -- 1.0-6.0
  unique (attempt_id, section)
);

create table toefl_response (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references toefl_attempt(id) on delete cascade,
  item_id       uuid not null references toefl_item(id),
  answer        jsonb,                       -- 유형별 구조: §6
  audio_path    text,                        -- speaking 녹음 Storage key
  transcript    text,                        -- STT 결과
  time_spent_ms int,
  is_correct    boolean,
  points_earned numeric(4,2),
  answered_at   timestamptz default now(),
  unique (attempt_id, item_id)
);

create table toefl_ai_score (
  id            uuid primary key default gen_random_uuid(),
  response_id   uuid not null references toefl_response(id) on delete cascade,
  model         text not null,
  rubric        jsonb not null,   -- {"delivery":3.5,"language_use":3.0,...}
  overall       numeric(3,1) not null,
  feedback_ko   text not null,
  feedback_en   text,
  raw_output    jsonb,
  created_at    timestamptz default now()
);

-- ============ 점수 변환표 (하드코딩 금지) ============
create table toefl_scale_conversion (
  id          uuid primary key default gen_random_uuid(),
  version     text not null,
  section     toefl_section not null,
  route       toefl_route not null,
  raw_min     numeric(6,2) not null,
  raw_max     numeric(6,2) not null,
  scaled      smallint not null,
  band        numeric(2,1) not null,
  unique (version, section, route, raw_min)
);
```

### RLS 정책 요구사항

- `toefl_attempt` / `toefl_response` / `toefl_ai_score`: 본인 행만 `select/insert/update`. 관리자 역할은 전체 조회.
- `toefl_item.answer_key`, `toefl_item.explanation_*`: **응시 중에는 절대 클라이언트로 내려보내지 않는다.** 클라이언트용 뷰 `toefl_item_public`(answer_key·explanation 제외)을 만들고, 정답/해설은 제출 후 서버 라우트로만 제공한다.
- `toefl_stimulus.transcript`: listening 응시 중 노출 금지 (동일 원칙).
- Storage 버킷 `toefl-audio`(공개 읽기 X, signed URL), `toefl-recordings`(private, 본인만).

---

## 6. 과제 유형별 데이터 계약 (12종)

`payload` / `answer_key` / `answer`(응답) 3자의 JSON 구조를 유형별로 고정한다. **여기서 벗어나는 구조를 만들면 채점 엔진이 깨진다.**

### Reading

**complete_the_words** — 단어 일부 글자 채우기
```jsonc
payload:    { "paragraph": "The ec_n_my expanded ...", "blanks": [{"id":"b1","masked":"ec_n_my","length":7}] }
answer_key: { "b1": "economy" }
answer:     { "b1": "economy" }
scoring:    auto_key, 대소문자·공백 무시, blank 단위 부분점수
```

**daily_life / academic_passage** — MCQ / 다중선택 / 문장삽입
```jsonc
payload:    { "format":"mcq|multi_select|insert_text",
              "options":[{"id":"A","text":"..."}],
              "select_count":1,
              "insert_positions":["p1","p2","p3","p4"] }   // insert_text 전용
answer_key: { "correct":["B"] }
answer:     { "selected":["B"] }
scoring:    auto_key. multi_select는 정답 2개 중 1개만 맞으면 0.5점(부분점수 규칙 명시)
```

> **multi_select 채점 공식(2026-08-27 확정, 교차검증 A항목)**: `format`이 `multi_select`가
> 아니면(mcq/insert_text/replay, payload에 format 자체가 없는 choose_a_response 포함) 완전
> 일치만 정답으로 인정하고 부분점수가 없다. `multi_select`만 아래 공식으로 부분점수를 준다:
> ```
> matched = 선택한 것 중 정답인 개수
> wrong   = 선택한 것 중 오답인 개수
> ratio   = max(0, matched - wrong) / 정답 개수      // 0 미만으로 내려가지 않음
> pointsEarned = round(ratio * 배점, 소수 2자리)
> isCorrect    = (ratio === 1 && wrong === 0)
> ```
> 즉 오답을 추가로 고르면 맞춘 개수에서 그만큼 뺀 뒤 비율을 낸다 — 정답만 전부 고르거나(만점),
> 정답 일부만 고르면(부분점수) 되지만, 오답을 하나라도 섞으면 그 오답 개수만큼 점수가 깎인다.
> 구현: `src/lib/toefl/scoring/score-item.ts`의 `scoreMcqLike`.

### Listening

**choose_a_response** — 짧은 발화 듣고 최적 응답 고르기
```jsonc
payload:    { "clip_path":"...", "options":[{"id":"A","text":"..."}] }
answer_key: { "correct":["C"] }
```

**conversation / announcement / academic_talk** — stimulus(오디오) 1개에 item 5–6개
```jsonc
payload:    { "format":"mcq|multi_select|replay",
              "replay_start_sec": 82, "replay_end_sec": 95,   // replay 전용
              "options":[...] }
```

> 규칙: 오디오 재생 완료 전 문항 노출 금지. 재생은 1회. 뒤로 가기 불가. `toefl_response`에 재생 완료 타임스탬프 기록.

### Speaking

**listen_and_repeat** — 문장 듣고 그대로 따라 말하기
```jsonc
payload:    { "clip_path":"...", "target_sentence":"The lecture begins at nine.",
              "response_window_sec": 8 }     // 문장 길이별 8/10/12초, 블루프린트에서 주입
answer_key: { "target_sentence":"The lecture begins at nine." }
scoring:    auto_transcript — STT 후 단어 정렬 정확도(WER) + ai_rubric(Delivery) 병합
```

**take_an_interview** — 인터뷰 3턴 (준비시간 10–15초, 응답 45초)
```jsonc
payload:    { "video_path":"...", "question_audio_path":"...",
              "prep_sec": 15, "response_sec": 45,
              "turn_type": "opinion|compare|hypothetical" }
answer_key: null
scoring:    ai_rubric — Delivery / Language Use / Topic Development
```

> 규칙: 질문 텍스트는 화면에 표시하지 않는다(음성 only). 준비시간 종료 시 자동 녹음 시작, 응답시간 종료 시 자동 중단.

### Writing

**build_a_sentence** — 어순 재배열
```jsonc
payload:    { "chunks":[{"id":"c1","text":"the committee"},{"id":"c2","text":"approved"}] }
answer_key: { "order":["c1","c2","c3","c4"], "accepted_alternatives":[["c1","c3","c2","c4"]] }
answer:     { "order":["c1","c2","c3","c4"] }
scoring:    auto_sequence — 완전일치 또는 accepted_alternatives 포함 시 정답
```

**write_an_email**
```jsonc
payload:    { "scenario":"...", "required_points":["시간 변경 요청","사유 설명","대안 제시"],
              "word_min":100, "word_max":130 }
scoring:    ai_rubric — Task Achievement / Coherence / Lexical Resource / Grammar
```

**academic_discussion**
```jsonc
payload:    { "professor_post":"...", "student_posts":[{"name":"Kelly","text":"..."}],
              "word_min":100, "word_max":150 }
scoring:    ai_rubric (동일 4지표) + "새로운 관점 제시 여부" 가점 규칙
```

---

## 7. 채점 엔진 규칙

`lib/toefl/scoring/` 아래에 순수 함수로 구현. DB·네트워크 접근 금지, 단위 테스트 100% 커버.

```
scoreItem(item, response) -> { isCorrect, pointsEarned }   // auto_* 3종
aggregateRaw(responses)   -> rawScore
routeStage2(stage1Raw, threshold) -> 'easy' | 'hard'
rawToScaled(raw, section, route, version) -> scaled 0-30   // DB 변환표 조회
scaledToBand(scaled) -> band 1.0-6.0
applyRouteCap(band, route) -> band                          // easy 경로 상한 4.0
```

**밴드 ↔ 영역점수 ↔ CEFR 매핑 (시드 데이터, 코드 아님)**

| Band | 0–30 | CEFR |
|---|---|---|
| 6.0 | 28–30 | C2 |
| 5.0–5.5 | 23–27 | C1 |
| 4.0–4.5 | 17–22 | B2 |
| 3.0–3.5 | 11–16 | B1 |
| 2.0–2.5 | 5–10 | A2 |
| 1.0–1.5 | 0–4 | A1 |

**총점**: 4개 영역 scaled 합 = 0–120 (레거시), 밴드 평균을 0.5 단위 반올림 = 종합 밴드. 리포트에는 셋 다 표시.

---

## 8. 적응형 라우팅 엔진

Reading·Listening에만 적용.

1. Stage1(route=`base`) 전원 응시 → 제출 즉시 서버에서 raw 집계
2. `stage1_raw >= threshold` → Stage2 `hard`, 미만 → Stage2 `easy`
3. `threshold`는 `toefl_form_blueprint.task_mix.routing_threshold`에서 읽는다 (하드코딩 금지)
4. `easy` 경로 최종 밴드는 **4.0 상한**
5. 라우팅 결과는 `toefl_section_attempt.routed_to`에 기록, 클라이언트에는 **어느 경로인지 알려주지 않는다**

> 라우팅 계산은 반드시 서버(Route Handler 또는 Postgres 함수)에서. 클라이언트 계산 금지.

> **예외(2026-08-27 확정, 교차검증 A항목)**: 위 5번 규칙은 **응시 중**(아직 그 섹션을 제출하기
> 전)의 클라이언트 응답에만 적용된다. **제출을 마친 뒤의 종합 리포트**(`GET
> /api/toefl/attempts/:id/insights`)는 예외로 `routed_to`를 그대로 공개한다 — 어느 모듈로
> 라우팅됐는지 알아야 "왜 이 점수가 나왔는지" 학생이 이해할 수 있고, 이미 그 섹션이 끝나
> 라우팅을 바꿔치기할 방법이 없어 부정행위 우려도 없다. 이 예외를 쓰는 화면은 리포트뿐이며,
> 응시 화면(`test/[attemptId]/...`)에는 여전히 어떤 형태로도 노출하지 않는다.

---

## 9. API 라우트 명세

```
POST   /api/toefl/attempts                    시험 시작 (form_id, mode) → attempt_id + 첫 module
GET    /api/toefl/attempts/:id/current        현재 모듈 문항 (answer_key·transcript 제외)
POST   /api/toefl/attempts/:id/responses      답안 저장 (배치, idempotent, upsert)
POST   /api/toefl/attempts/:id/sections/:s/finish   영역 종료 → 라우팅 or 다음 영역
POST   /api/toefl/attempts/:id/submit         전체 제출 → 자동채점 실행
POST   /api/toefl/attempts/:id/recordings     Speaking 업로드용 signed URL 발급
GET    /api/toefl/attempts/:id/report         성적 리포트 (제출 후에만 해설 포함)
POST   /api/toefl/ai-score/:responseId        AI 채점 트리거 (내부용, 큐 처리)

-- admin
POST   /api/admin/toefl/forms                 폼 생성
POST   /api/admin/toefl/items/bulk            문항 일괄 등록 (JSON 검증 후)
POST   /api/admin/toefl/items/:id/review      검수 승인
```

**공통 규칙**: 모든 응답 저장은 idempotent(`attempt_id + item_id` unique upsert). 클라이언트 재시도로 중복 행이 생기면 안 된다.

---

## 10. 화면 / 라우팅 구조

```
app/toefl/
  page.tsx                        대시보드 (응시 이력, 밴드 추이)
  practice/[section]/page.tsx     영역별 연습 선택
  test/[attemptId]/
    layout.tsx                    타이머 HUD + 이탈 방지
    reading/page.tsx
    listening/page.tsx
    speaking/page.tsx
    writing/page.tsx
    review/page.tsx               종료 안내
  report/[attemptId]/page.tsx     성적 리포트 + 문항별 한국어 해설
app/admin/toefl/
  forms/…                         폼·모듈 관리
  items/…                         문항 등록·검수
```

**컴포넌트**: `components/toefl/` 아래 task_type별 렌더러 12개 + `TaskRenderer` 디스패처(switch 하나). 유형별 if문을 페이지에 흩뿌리지 않는다.

**UI 요구사항**
- 시험 화면은 앱 전역 네비게이션 숨김(전체화면 몰입)
- 타이머는 상시 표시, 잔여 5분 시 색상 경고
- Reading: 좌 지문 / 우 문항 2단 (모바일은 탭 전환)
- Listening: 재생 중 문항 숨김, 노트 패드 제공
- Speaking: 마이크 권한 사전 체크 화면 필수 + 파형 표시
- Writing: 실시간 단어 수 카운터, 목표 범위 이탈 시 경고

---

## 11. 시험 세션 상태머신 (가장 버그가 많이 나는 지점)

```
idle → section_intro → module_running → module_submitting
     → (routing) → module_running(stage2) → section_done → … → submitted
```

**철칙**

1. **타이머 권위는 서버**: `deadline_at`을 서버가 발급. 클라이언트는 표시만. 제출 시 서버가 `now() > deadline_at + 5s`면 초과분 응답 거부.
2. **자동 저장**: 답안 변경 시 debounce 3초 + 문항 이동 시 즉시 저장.
3. **새로고침 복구**: `/current`가 항상 현재 모듈·잔여 시간·기존 답안을 반환. 로컬스토리지에 의존하지 않는다.
4. **뒤로 가기 방지**: Listening/Speaking은 제출 후 되돌아가기 불가 (서버에서 거부).
5. **오프라인**: 네트워크 끊김 시 응답을 IndexedDB 큐에 쌓고 복구 시 배치 전송.
6. **Speaking 녹음**: MediaRecorder(`audio/webm;codecs=opus`), 녹음 종료 즉시 signed URL로 직접 업로드. 업로드 실패 시 3회 재시도 후 사용자 경고.

---

## 12. AI 채점 파이프라인

### Writing
```
제출 → 큐 → Claude 호출(루브릭 프롬프트) → JSON 파싱 → toefl_ai_score 저장 → 리포트 반영
```

루브릭 4지표 각 0–5, 응답은 **JSON only**로 강제:
```json
{ "task_achievement":4, "coherence":3.5, "lexical_resource":4, "grammar":3.5,
  "overall_band":4.0,
  "feedback_ko":"요구 항목 3개 중 2개만 다뤘습니다. …",
  "strengths":["…"], "improvements":["…"],
  "corrected_excerpts":[{"original":"…","corrected":"…","reason_ko":"…"}] }
```

### Speaking
```
녹음 → STT → (listen_and_repeat) 단어 정렬 정확도 계산
            (take_an_interview) Claude 루브릭 3지표(Delivery/Language Use/Topic Development)
```
- STT 정확도가 발음 평가를 대체할 수 없음을 UI에 명시한다. Delivery 점수는 **참고용**으로 표기.
- `listen_and_repeat`은 STT 결과 vs `target_sentence`의 단어 단위 정렬 → 정확도 %. 무음/미응답은 0점.

**공통**: 모든 AI 호출은 재시도 2회 + 실패 시 `status='pending_manual'`로 남기고 관리자 큐에 노출. 채점 실패가 리포트 전체를 막지 않게 한다.

---

## 13. 기존 어휘 시스템 연동

- `toefl_item.vocab_ids` → 기존 어휘 DB의 단어 ID 배열
- 오답 발생 시 해당 문항에 연결된 단어를 **FSRS 복습 큐에 자동 삽입** (기존 스케줄러 재사용, 신규 구현 금지)
- Reading `complete_the_words` 오답은 confusion pair 후보로 기록
- 어휘 5단계 사다리 레벨 ↔ TOEFL 밴드 매핑 테이블을 `toefl_vocab_level_map`에 별도 저장 (L1≈밴드2, L5≈밴드5.5 기준, 조정 가능하게)

---

## 14. 비기능 요구

- **보안**: 정답·스크립트 클라이언트 노출 금지(§5). 응시 중 `/api/toefl/items` 직접 조회 차단.
- **성능**: 모듈 진입 시 문항+스티뮬러스 1회 페치, 오디오는 사전 프리로드. 모듈 전환 지연 500ms 이하.
- **접근성**: 타이머 `aria-live="polite"`, 키보드만으로 전 문항 조작 가능, 오디오 스크립트는 **제출 후** 제공.
- **로깅**: 모든 라우팅 결정·타이머 만료·업로드 실패를 구조화 로그로 남긴다.
- **i18n**: 학생 응시 화면은 영어, 해설·리포트·관리자 UI는 한국어.

---

## 15. 구현 순서 & 완료 조건(DoD)

| Phase | 범위 | DoD |
|---|---|---|
| **P0** | 스키마 + RLS + 시드 1폼(각 영역 최소 문항) + 타입 생성 | `supabase db reset` 후 시드 통과, 타입 에러 0 |
| **P1** | Reading 3유형 + 라우팅 + 채점 + 리포트 | Reading 단독 응시 → 밴드 산출까지 E2E 통과 |
| **P2** | Listening 4유형 + 오디오 재생 규칙 | 재생 1회 제한·뒤로가기 차단 테스트 통과 |
| **P3** | Writing 3유형 + AI 루브릭 채점 | 3개 과제 제출 → 4지표 피드백 생성 |
| **P4** | Speaking 2유형 + 녹음/업로드/STT | 녹음 → 업로드 → 전사 → 점수 E2E 통과 |
| **P5** | 풀 모의고사 + 통합 리포트 + 어휘 연동 | 90분 풀 세트 무중단 완주, 총점/밴드/CEFR 표시 |
| **P6** | 관리자 문항 등록·검수 UI | 비개발자가 문항 20개 등록 가능 |

**각 Phase 종료 시 필수**: 단위 테스트(채점 함수), Playwright E2E 1개, `docs/toefl-spec.md`의 변경 사항 반영.

---

## 16. Claude Code 투입 프롬프트

### P0 프롬프트
```
docs/toefl-spec.md를 읽고 시작해.
작업: TOEFL 모듈 P0 (스키마 + 시드)
1. spec §5의 DDL을 supabase/migrations/에 마이그레이션으로 작성.
   - enum, 테이블, 인덱스, RLS 정책 전부 포함
   - toefl_item_public 뷰 (answer_key, explanation_* 제외) 생성
2. §7 밴드 변환표를 toefl_scale_conversion 시드로 작성.
3. §2 블루프린트를 toefl_form_blueprint 시드로 작성.
   - 시간·문항 수는 절대 코드에 하드코딩하지 말고 이 테이블에서만 읽을 것
4. 12개 task_type 각각 최소 1문항씩 포함한 데모 폼 1개 시드 작성.
   payload/answer_key 구조는 §6을 정확히 따를 것. 임의 변형 금지.
5. supabase gen types로 TypeScript 타입 생성, lib/toefl/types.ts에 재export.
제약:
- 기존 어휘 시스템 테이블은 건드리지 말 것
- ETS 실제 문항 사용 금지, 전부 자체 창작 예시 문항
- 완료 후 `supabase db reset`이 에러 없이 통과하는지 직접 확인하고 결과를 보고할 것
```

### P1 프롬프트
```
docs/toefl-spec.md §6 §7 §8 §9 §10 §11을 읽고 시작해.
작업: TOEFL Reading 영역 (P1)
1. lib/toefl/scoring/ 에 순수 함수 구현 (§7 시그니처 그대로).
   DB/네트워크 접근 금지. Vitest 단위 테스트 동시 작성, 경계값 포함.
2. §9의 attempts 관련 Route Handler 5개 구현. 모든 응답 저장은 idempotent upsert.
3. §8 적응형 라우팅을 서버에서 구현. 클라이언트에 route 값 노출 금지.
4. components/toefl/ 에 TaskRenderer 디스패처 + Reading 3유형 렌더러.
5. app/toefl/test/[attemptId]/reading/page.tsx — 좌 지문/우 문항 2단, 서버 권위 타이머.
6. 새로고침 복구 테스트: 응시 중 새로고침해도 잔여 시간·기존 답안이 유지되어야 함.
완료 조건: Reading 단독 응시 → 제출 → 밴드 산출까지 Playwright E2E 1개 통과.
작업 중 spec과 충돌하는 부분이 있으면 코드를 바꾸지 말고 먼저 질문할 것.
```

> P2~P6도 같은 형식(참조 섹션 → 작업 목록 → 완료 조건 → 제약)으로 이어서 작성한다. **한 프롬프트당 한 영역**을 지킨다.

---

## 17. 금지 사항 (Claude Code에 명시할 것)

1. 시간·문항 수·라우팅 임계값을 코드에 하드코딩하지 않는다 → 전부 블루프린트 테이블
2. 정답·스크립트를 응시 중 클라이언트로 보내지 않는다
3. 타이머·라우팅·채점을 클라이언트에서 계산하지 않는다
4. `payload`/`answer_key` 구조를 §6에서 임의 변형하지 않는다
5. 기존 어휘/FSRS 스케줄러를 새로 구현하지 않는다 — 재사용
6. ETS 실제 콘텐츠를 어떤 형태로도 넣지 않는다
7. localStorage를 응시 상태의 단일 저장소로 쓰지 않는다
8. 4개 영역을 한 번에 구현하지 않는다

---

## 18. 검증 체크리스트

**채점**
- [ ] multi_select 부분점수 규칙이 명세대로 동작
- [ ] easy 경로 밴드 상한 4.0 적용
- [ ] build_a_sentence의 accepted_alternatives 인정
- [ ] complete_the_words 대소문자·공백 무시

**세션**
- [ ] 시간 만료 후 제출된 답안 서버 거부
- [ ] 새로고침 후 잔여 시간·답안 복구
- [ ] Listening 오디오 재생 1회 제한, 뒤로 가기 차단
- [ ] 네트워크 끊김 후 복구 시 답안 유실 없음

**보안**
- [ ] 네트워크 탭에서 정답·스크립트 노출 없음
- [ ] 타인 attempt 조회 시 RLS 차단
- [ ] Speaking 녹음 파일 타인 접근 불가

**AI 채점**
- [ ] JSON 파싱 실패 시 재시도 후 pending_manual 전환
- [ ] 채점 실패해도 나머지 리포트 정상 표시
- [ ] 한국어 피드백 품질 (샘플 10건 수동 검수)

---

*v1 — 2026-08. 블루프린트 수치는 ETS 공식 Test Blueprint 확인 후 `toefl_form_blueprint` 시드만 교체할 것.*
