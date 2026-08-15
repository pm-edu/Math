# TOEFL 4개 영역 모듈 — Claude Code 구현 지시서 v2 (참고용 초안, 미채택)

> **상태: 참고용으로만 보관. 지금은 채택하지 않음.**
> 2026-08-15, P0~P5(4개 영역 개별 연습 + 풀 모의고사 통합)가 v1(`docs/toefl-spec.md`) 기준으로
> 이미 완성·배포된 뒤에 사용자가 이 v2 초안을 전달함. v1을 v2로 전면 교체하면 이미 만든 스키마·
> API·화면을 상당 부분 다시 짜야 해서(게스트 모드, `mode` enum 4종 확장, 진입 3화면, 리포트
> 점진공개 등), **v1을 계속 SSOT로 유지하고 v2는 나중에(특히 결제 연동이 이 사이트에 실제로
> 붙을 때) 다시 검토하기로 확정함.** 지금 이 파일에서 뭔가를 구현하지 말 것 —
> 작업 시작 전에는 항상 `docs/toefl-spec.md`(v1)를 먼저 읽을 것.
>
> v2의 핵심 변경 중 결제/게스트모드와 무관한 작은 개선(예: 리포트에 적응형 라우팅 결과 공개,
> 접근성 규격 일부)은 v1 위에 개별적으로 반영을 검토할 수 있음 — toefl-subsystem-plan 메모 참고.

---

## 0. 이 문서 사용법
> **대상 스택**: Next.js (App Router) + Supabase (Postgres/Auth/Storage) + Vercel
> **v1 → v2 변경**: 경쟁 서비스(TestGlider) 비교 분석 결과를 반영. 스키마 3건, 진입 흐름, 채점 대기 UX, 접근성 규격을 보강했다.
> **저장 위치**: `docs/toefl-spec.md`

1. 이 파일을 `docs/toefl-spec.md`로 커밋한다.
2. `CLAUDE.md`에 추가: `TOEFL 관련 작업은 반드시 docs/toefl-spec.md를 먼저 읽고 시작할 것.`
3. §17의 Phase별 프롬프트를 **한 번에 하나씩** 투입한다. 4개 영역을 한 프롬프트로 요청하지 않는다.
4. §1 결정사항을 확정한 뒤 P0을 시작한다.

### v2 변경 요약 (v1에서 넘어온 경우 반드시 읽을 것)

| # | 변경 | 이유 | 반영 시점 |
|---|---|---|---|
| C1 | `toefl_attempt.user_id` nullable + `guest_token` | 비로그인 맛보기 응시 불가 → 진입 장벽 | **P0 필수** |
| C2 | `mode` enum 4종으로 확장 (`task_practice`, `skill_drill` 추가) | 연습 계층이 2단계뿐이었음 | **P0 필수** |
| C3 | `toefl_item` 해설 영상 필드, `toefl_form.nickname` | 해설강의 연동 / 세트 식별성 | **P0 필수** |
| C4 | 진입 흐름 3화면 신설 (§11) | 폼 선택·형태 선택·사전 점검 화면이 없었음 | P1 |
| C5 | 리포트 점진 공개 (§13) | 제출 후 AI 채점 대기 중 빈 화면 | P3 |
| C6 | 라우팅 결과를 리포트에서 공개 (§9) | easy 경로 4.0 상한을 모르면 이탈 | P1 |
| C7 | 접근성 규격 구체화 (§15) | v1은 3줄짜리라 실제로 무시됨 | 전 Phase |
| C8 | `pending_manual`을 정식 상품 경로로 승격 (§14) | 1:1 첨삭이 대형 플랫폼 대비 차별점 | P5 |

---

## 1. 착수 전 확정할 결정 사항

| # | 결정 항목 | 기본값(제안) | 영향 |
|---|---|---|---|
| D1 | 기존 어휘 사이트 편입 vs 독립 앱 | **기존 사이트 `/toefl` 네임스페이스** (auth·FSRS 재사용) | 전체 |
| D2 | 2026 개편 포맷 vs 구 포맷 | **2026 개편 전용** (§2) | 스키마·UI 전부 |
| D3 | Speaking 채점 | STT(Whisper 계열) + Claude 루브릭 | P4 |
| D4 | 오디오 소스 | TTS 사전 렌더링 후 Storage 저장 | P2 |
| D5 | 적응형 라우팅 | **MVP에서 구현** | P1 |
| D6 | 무료/유료 게이팅 | 비로그인 맛보기 1영역 → 가입 시 1세트 → 이후 유료 | P0(스키마), P6(과금) |

**저작권**: ETS 실제 문항·지문·오디오는 어떤 형태로도 넣지 않는다. 전부 자체 제작/AI 생성. 푸터에 `TOEFL®은 ETS의 등록상표이며 본 서비스는 ETS의 승인·제휴 관계가 없습니다` 고지.

---

## 2. 반드시 반영할 사실 — 2026년 1월 개편

2025년 이전 자료로 만들면 구조 자체가 틀린 제품이 된다.

| 항목 | 구 포맷 | 2026 포맷 |
|---|---|---|
| 총 시간 | 약 2시간 | **약 90분**, 휴식 없음 |
| 순서 | R → L → S → W | **R → L → S → W (고정)** |
| 적응형 | 없음 | **Reading/Listening 2단계 (Stage1 → Stage2)** |
| 점수 | 0–120 | **1.0–6.0 밴드(0.5 단위)** + 0–30 + 0–120 병기 |
| Reading | 지문 2개 MCQ | Complete the Words / Daily Life / Academic Passages |
| Listening | 대화·강의 | Choose a Response / Conversations / Announcements / Academic Talks |
| Speaking | Independent 1 + Integrated 3 | **Listen and Repeat + Take an Interview(3턴)** |
| Writing | 에세이 2편 | **Build a Sentence + Write an Email + Academic Discussion** |

**시간·문항 수는 출처마다 편차가 있다**(Reading 30 vs 35분, Speaking 8 vs 16분).
→ **코드에 하드코딩 금지.** 전부 `toefl_form_blueprint`에서 읽는다. ETS 공식 Blueprint 확인 후 시드만 교체하면 되도록 만든다. 선택이 아니라 필수 요구사항.

---

## 3. 스코프

**In (v1 제품)**: 4개 영역 문항 뱅크 · 응시 엔진 · 자동/AI 채점 · 성적 리포트 · 적응형 라우팅 · 4단계 연습 모드 · 비로그인 맛보기 · 관리자 문항 등록/검수

**Out**: 실시간 프록터링 · 커뮤니티/포럼 · 목표 대학 매칭 · 모바일 네이티브 앱 · 결제 연동(법인 결정 대기) · IELTS/PTE 확장

> 경쟁사가 붙여놓은 커뮤니티·후기 포인트·응시권 리셀링은 1인 운영에서 전부 빈 껍데기가 된다. 의도적으로 제외한다.

---

## 4. 용어집 (코드·DB·UI 전부 이 용어만)

- **form** — 완결된 시험 세트 1회분 (닉네임 부여, 예: `사과`)
- **section** — reading / listening / speaking / writing
- **module** — 한 section 내 Stage1 또는 Stage2 블록. 라우팅 단위
- **stimulus** — 지문·오디오·프롬프트 등 문항이 물린 자료
- **item** — 채점 단위 문항 1개
- **task_type** — 12종 과제 유형 (§7)
- **attempt** — 1회 응시 / **response** — item 1개 답안
- **scaled score** 0–30 / **band** 1.0–6.0

---

## 5. 사용자 진입 계층 (v2 신설)

연습 단위를 4계층으로 정의한다. `toefl_attempt.mode`가 이 계층을 표현한다.

| mode | 단위 | 소요 | 대상 | 로그인 |
|---|---|---|---|---|
| `full` | 4개 영역 전체 | ~90분 | 실전 점검 | 필수 |
| `section_practice` | 1개 영역 | 8~35분 | 영역 집중 | 필수 |
| `task_practice` | task_type 1종 | 5~10분 | 유형 훈련 (Complete the Words 등) | **불필요(맛보기)** |
| `skill_drill` | skill_tag 1종 | 5~10분 | 약점 스킬 (inference 등) | 필수 |

**게이팅 규칙**
- 비로그인: `task_practice` 3세션까지 (guest_token 기준)
- 가입 직후: 무료 폼 1세트 전체 개방 + 게스트 응시 이력 자동 승계
- 이후: 유료

---

## 6. DB 스키마 (Supabase / Postgres DDL)

```sql
-- ============ ENUMS ============
create type toefl_section as enum ('reading','listening','speaking','writing');
create type toefl_task_type as enum (
  'complete_the_words','daily_life','academic_passage',
  'choose_a_response','conversation','announcement','academic_talk',
  'listen_and_repeat','take_an_interview',
  'build_a_sentence','write_an_email','academic_discussion'
);
create type toefl_stage  as enum ('stage1','stage2');
create type toefl_route  as enum ('base','easy','hard');
create type toefl_scoring_mode as enum ('auto_key','auto_sequence','auto_transcript','ai_rubric');
create type toefl_attempt_status as enum ('in_progress','submitted','auto_scored','scored','abandoned');
create type toefl_attempt_mode as enum ('full','section_practice','task_practice','skill_drill');  -- [C2]
create type toefl_ai_score_status as enum ('pending','scored','failed','pending_manual','manual_scored'); -- [C8]

-- ============ 블루프린트 (시간·문항수 = 데이터, 코드 아님) ============
create table toefl_form_blueprint (
  id             uuid primary key default gen_random_uuid(),
  version        text not null,               -- 'ETS-2026-04'
  section        toefl_section not null,
  stage          toefl_stage not null,
  route          toefl_route not null,
  time_limit_sec int not null,
  item_count     int not null,
  task_mix       jsonb not null,              -- {"complete_the_words":6,"routing_threshold":0.6,...}
  is_active      boolean not null default true,
  unique (version, section, stage, route)
);

-- ============ 콘텐츠 ============
create table toefl_form (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,      -- 'TOEFL_FORM_001'
  nickname          text unique not null,      -- [C3] '사과' — 학생 노출용 식별자
  title             text not null,
  blueprint_version text not null,
  is_free           boolean not null default false,
  is_published      boolean not null default false,
  created_at        timestamptz default now()
);

create table toefl_module (
  id       uuid primary key default gen_random_uuid(),
  form_id  uuid not null references toefl_form(id) on delete cascade,
  section  toefl_section not null,
  stage    toefl_stage not null,
  route    toefl_route not null,
  position int not null,
  unique (form_id, section, stage, route)
);

create table toefl_stimulus (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references toefl_module(id) on delete cascade,
  task_type   toefl_task_type not null,
  title       text,
  body        text,                            -- 지문 원문 (markdown)
  audio_path  text,                            -- Storage key
  transcript  text,                            -- 오디오 스크립트 (제출 후에만 노출)
  audio_duration_sec int,
  image_path  text,
  position    int not null,
  metadata    jsonb default '{}'::jsonb        -- {"word_count":640,"topic":"biology","cefr":"B2"}
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
  payload       jsonb not null,                -- 유형별 구조: §7
  answer_key    jsonb,                         -- ai_rubric이면 null
  explanation_ko text,                         -- 한국어 해설 (필수)
  explanation_en text,
  explanation_video_url       text,            -- [C3] 해설 영상
  explanation_video_start_sec int,             -- [C3] 문항별 타임스탬프 딥링크
  skill_tags    text[] default '{}',           -- {'inference','vocab_in_context'}
  vocab_ids     uuid[] default '{}',           -- 어휘 DB 연동 (§16)
  created_at    timestamptz default now()
);
create index on toefl_item (module_id, position);
create index on toefl_item using gin (skill_tags);
create index on toefl_item (task_type);

-- ============ 응시 ============
create table toefl_attempt (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,   -- [C1] nullable
  guest_token  text,                                                -- [C1] 비로그인 응시
  form_id      uuid not null references toefl_form(id),
  mode         toefl_attempt_mode not null,
  scope_value  text,                          -- section_practice='reading', task_practice='daily_life'
  status       toefl_attempt_status not null default 'in_progress',
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at    timestamptz,
  constraint owner_present check (user_id is not null or guest_token is not null),
  constraint guest_scope   check (user_id is not null or mode = 'task_practice')  -- 게스트는 유형연습만
);
create index on toefl_attempt (user_id, started_at desc);
create index on toefl_attempt (guest_token) where guest_token is not null;

create table toefl_section_attempt (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references toefl_attempt(id) on delete cascade,
  section      toefl_section not null,
  started_at   timestamptz,
  deadline_at  timestamptz,                   -- 서버 권위 타이머 (§12)
  finished_at  timestamptz,
  stage1_raw   numeric(6,2),
  routed_to    toefl_route,
  raw_score    numeric(6,2),
  scaled_score smallint,
  band         numeric(2,1),
  unique (attempt_id, section)
);

create table toefl_response (
  id            uuid primary key default gen_random_uuid(),
  attempt_id    uuid not null references toefl_attempt(id) on delete cascade,
  item_id       uuid not null references toefl_item(id),
  answer        jsonb,
  audio_path    text,
  transcript    text,
  time_spent_ms int,
  is_correct    boolean,
  points_earned numeric(4,2),
  answered_at   timestamptz default now(),
  unique (attempt_id, item_id)
);

create table toefl_ai_score (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references toefl_response(id) on delete cascade,
  status      toefl_ai_score_status not null default 'pending',  -- [C8]
  model       text,
  rubric      jsonb,
  overall     numeric(3,1),
  feedback_ko text,
  feedback_en text,
  raw_output  jsonb,
  reviewed_by uuid references auth.users(id),  -- [C8] 사람 첨삭자
  reviewed_at timestamptz,
  created_at  timestamptz default now()
);

-- ============ 점수 변환표 (하드코딩 금지) ============
create table toefl_scale_conversion (
  id      uuid primary key default gen_random_uuid(),
  version text not null,
  section toefl_section not null,
  route   toefl_route not null,
  raw_min numeric(6,2) not null,
  raw_max numeric(6,2) not null,
  scaled  smallint not null,
  band    numeric(2,1) not null,
  unique (version, section, route, raw_min)
);
```

### 게스트 승계 (C1 필수 구현)

```
POST /api/toefl/attempts/claim   { guest_token }
→ 로그인 상태에서만 호출 가능
→ 해당 guest_token의 attempt 전부 user_id 설정, guest_token=null
→ 90일 경과한 미승계 게스트 attempt는 야간 배치로 삭제
```

### RLS 요구사항

- `toefl_attempt`/`toefl_response`/`toefl_ai_score`: 본인 행만. **게스트는 `guest_token` 일치 시에만** (헤더로 전달, 서버에서 검증). 관리자 역할은 전체 조회.
- `answer_key`, `explanation_*`, `stimulus.transcript`: **응시 중 클라이언트 전송 절대 금지.** 클라이언트용 뷰 `toefl_item_public`(해당 컬럼 제외)을 만들고, 정답·해설은 제출 후 서버 라우트로만 제공.
- Storage: `toefl-audio`(signed URL), `toefl-recordings`(private, 본인만).

---

## 7. 과제 유형별 데이터 계약 (12종)

`payload` / `answer_key` / `answer` 구조를 고정한다. **여기서 벗어나면 채점 엔진이 통째로 깨진다.**

### Reading

**complete_the_words**
```jsonc
payload:    { "paragraph":"The ec_n_my expanded ...", "blanks":[{"id":"b1","masked":"ec_n_my","length":7}] }
answer_key: { "b1":"economy" }
answer:     { "b1":"economy" }
scoring:    auto_key · 대소문자·공백 무시 · blank 단위 부분점수
```

**daily_life / academic_passage**
```jsonc
payload:    { "format":"mcq|multi_select|insert_text",
              "options":[{"id":"A","text":"..."}], "select_count":1,
              "insert_positions":["p1","p2","p3","p4"] }
answer_key: { "correct":["B"] }
answer:     { "selected":["B"] }
scoring:    auto_key · multi_select는 2개 중 1개 정답 시 0.5점
```

### Listening

**choose_a_response**
```jsonc
payload:    { "clip_path":"...", "options":[{"id":"A","text":"..."}] }
answer_key: { "correct":["C"] }
```

**conversation / announcement / academic_talk** — stimulus 1개에 item 5–6개
```jsonc
payload:    { "format":"mcq|multi_select|replay",
              "replay_start_sec":82, "replay_end_sec":95, "options":[...] }
```

> 오디오 재생 완료 전 문항 노출 금지 · 재생 1회 · 뒤로 가기 불가 · 재생 완료 타임스탬프 기록

### Speaking

**listen_and_repeat**
```jsonc
payload:    { "clip_path":"...", "target_sentence":"The lecture begins at nine.",
              "response_window_sec":8 }        // 8/10/12초, 블루프린트에서 주입
answer_key: { "target_sentence":"..." }
scoring:    auto_transcript (단어 정렬 정확도) + ai_rubric(Delivery)
```

**take_an_interview**
```jsonc
payload:    { "video_path":"...", "question_audio_path":"...",
              "prep_sec":15, "response_sec":45,
              "turn_type":"opinion|compare|hypothetical" }
scoring:    ai_rubric — Delivery / Language Use / Topic Development
```

> 질문 텍스트 화면 표시 금지(음성 only) · 준비시간 종료 시 자동 녹음 시작 · 응답시간 종료 시 자동 중단

### Writing

**build_a_sentence**
```jsonc
payload:    { "chunks":[{"id":"c1","text":"the committee"},{"id":"c2","text":"approved"}] }
answer_key: { "order":["c1","c2","c3","c4"], "accepted_alternatives":[["c1","c3","c2","c4"]] }
answer:     { "order":["c1","c2","c3","c4"] }
scoring:    auto_sequence
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
scoring:    ai_rubric (4지표) + "새로운 관점 제시" 가점
```

---

## 8. 채점 엔진

`lib/toefl/scoring/` 에 순수 함수로. DB·네트워크 접근 금지, 단위 테스트 필수.

```
scoreItem(item, response)  -> { isCorrect, pointsEarned }
aggregateRaw(responses)    -> rawScore
routeStage2(stage1Raw, threshold) -> 'easy' | 'hard'
rawToScaled(raw, section, route, version) -> 0-30
scaledToBand(scaled)       -> 1.0-6.0
applyRouteCap(band, route) -> band            // easy 상한 4.0
```

**밴드 매핑 (시드 데이터)**

| Band | 0–30 | CEFR |
|---|---|---|
| 6.0 | 28–30 | C2 |
| 5.0–5.5 | 23–27 | C1 |
| 4.0–4.5 | 17–22 | B2 |
| 3.0–3.5 | 11–16 | B1 |
| 2.0–2.5 | 5–10 | A2 |
| 1.0–1.5 | 0–4 | A1 |

**총점**: scaled 합 = 0–120(레거시), 밴드 평균 0.5 반올림 = 종합 밴드. 리포트에 셋 다 표시.

---

## 9. 적응형 라우팅

Reading·Listening 전용.

1. Stage1(`base`) 전원 응시 → 제출 즉시 서버에서 raw 집계
2. `stage1_raw >= threshold` → Stage2 `hard`, 미만 → `easy`
3. `threshold`는 `toefl_form_blueprint.task_mix.routing_threshold`에서 읽는다 (하드코딩 금지)
4. `easy` 경로 최종 밴드 **4.0 상한**
5. 계산은 반드시 서버에서. 클라이언트 계산 금지

**[C6] 공개 정책 — 응시 중 숨김 / 리포트에서 공개**

응시 중 route 노출은 금지하되, **리포트에서는 반드시 공개한다.** easy 경로로 4.0 상한에 걸린 학생이 "다 맞았는데 왜 4.0이지?"에서 이탈하는 것을 막는 것이 학습 도구의 존재 이유다.

리포트 문구 예:
> `Stage 1에서 하위 모듈로 배정되어 이 영역의 최대 밴드가 4.0으로 제한되었습니다. Stage 1 정답률을 65% 이상으로 올리면 상위 모듈에 진입해 6.0까지 받을 수 있습니다.`

FAQ 페이지에 "Upper/Lower를 알 수 있나요?", "더미 문항이 있나요?" 항목을 넣는다. 실제 학습자가 가장 많이 묻는 질문이다.

---

## 10. API 라우트

```
POST   /api/toefl/attempts                          시험 시작 → attempt_id + 첫 module
POST   /api/toefl/attempts/claim                    [C1] 게스트 응시 승계
GET    /api/toefl/attempts/:id/current              현재 모듈 (answer_key·transcript 제외)
POST   /api/toefl/attempts/:id/responses            답안 저장 (배치, idempotent upsert)
POST   /api/toefl/attempts/:id/sections/:s/finish   영역 종료 → 라우팅 or 다음 영역
POST   /api/toefl/attempts/:id/submit               전체 제출 → 자동채점 즉시 실행
POST   /api/toefl/attempts/:id/recordings           녹음 업로드 signed URL
GET    /api/toefl/attempts/:id/report               리포트 (제출 후에만 해설 포함)
GET    /api/toefl/attempts/:id/report/status        [C5] AI 채점 진행률 폴링
GET    /api/toefl/attempts/resumable                [C4] 진행 중 응시 목록
POST   /api/toefl/ai-score/:responseId              AI 채점 트리거 (내부, 큐)
-- admin
POST   /api/admin/toefl/forms
POST   /api/admin/toefl/items/bulk
POST   /api/admin/toefl/items/:id/review
POST   /api/admin/toefl/ai-score/:id/override       [C8] 사람 첨삭 등록
```

**공통**: 모든 응답 저장은 idempotent(`attempt_id + item_id` unique upsert). 재시도로 중복 행이 생기면 안 된다.

---

## 11. 화면 구조 & 진입 흐름 [C4]

v1에는 대시보드와 응시 화면 사이가 비어 있었다. 진입 3화면을 신설한다.

```
app/toefl/
  page.tsx                          대시보드
                                    ├ 진행 중 응시 "이어하기" 카드  ← [C4] 필수
                                    ├ 밴드 추이 그래프
                                    └ 약점 스킬 Top3 → skill_drill 바로가기
  tests/page.tsx                    ① 폼 선택 — 닉네임·응시 여부·최고 밴드 표시
  tests/[formCode]/page.tsx         ② 응시 형태 선택 — 풀세트 / 영역별 / 유형별
  tests/[formCode]/preflight/page.tsx ③ 사전 점검 — 소요시간·중단불가 고지·마이크 체크
  drills/[taskType]/page.tsx        유형별 연습 (비로그인 진입 가능)
  test/[attemptId]/
    layout.tsx                      타이머 HUD + 이탈 방지
    reading|listening|speaking|writing/page.tsx
  report/[attemptId]/page.tsx       리포트 (점진 공개, §13)
app/admin/toefl/
  forms/… items/… reviews/…
```

**컴포넌트**: `components/toefl/` 에 task_type별 렌더러 12개 + `TaskRenderer` 디스패처(switch 하나). 유형별 if문을 페이지에 흩뿌리지 않는다.

**사전 점검 화면(③)에서 반드시 확인**
- 예상 소요 시간과 "시작 후 일시정지 불가" 고지
- Speaking 포함 시 마이크 권한 + 녹음 테스트 (3초 녹음 → 재생 확인)
- 오디오 출력 테스트
- 네트워크 상태

**UI 요구사항**
- 시험 화면은 전역 네비게이션 숨김(몰입)
- 타이머 상시 표시, 잔여 5분 시 **색상 + 텍스트 + aria-live** 3중 경고
- Reading: 좌 지문 / 우 문항 2단 (모바일은 탭 전환)
- Listening: 재생 중 문항 숨김, 노트 패드 제공
- Speaking: 파형 표시 + 남은 시간 카운트다운
- Writing: 실시간 단어 수, 목표 범위 이탈 시 경고

**모바일 정책**: `task_practice`·`skill_drill`은 모바일 웹 완전 지원. `full`은 데스크톱 권장 배너 표시(차단은 하지 않음).

---

## 12. 시험 세션 상태머신

```
idle → preflight → section_intro → module_running → module_submitting
     → (routing) → module_running(stage2) → section_done → … → submitted
```

**철칙**

1. **타이머 권위는 서버**: `deadline_at`을 서버가 발급. 클라이언트는 표시만. 제출 시 `now() > deadline_at + 5s`면 초과 응답 거부.
2. **자동 저장**: 답안 변경 시 debounce 3초 + 문항 이동 시 즉시.
3. **새로고침 복구**: `/current`가 항상 현재 모듈·잔여 시간·기존 답안 반환. localStorage에 의존하지 않는다.
4. **뒤로 가기 방지**: Listening/Speaking은 제출 후 되돌아가기 서버에서 거부.
5. **오프라인**: 끊김 시 IndexedDB 큐 → 복구 시 배치 전송.
6. **녹음**: MediaRecorder(`audio/webm;codecs=opus`), 종료 즉시 signed URL 직접 업로드. 실패 시 3회 재시도 후 경고.
7. **[C4] 이어하기**: `in_progress` attempt는 대시보드 최상단 카드로 노출. 90분 무중단 완주는 소수다.

---

## 13. 리포트 점진 공개 [C5]

제출 직후 빈 화면을 보여주면 안 된다. 영역별로 확정되는 대로 순차 공개한다.

```
제출 → status='auto_scored' (Reading/Listening 즉시 확정)
     → 리포트 진입: R/L 밴드 확정 표시 + W/S "채점 중 (예상 1분)" 자리표시자
     → AI 채점 완료 시 폴링(/report/status)으로 실시간 갱신
     → 전부 완료 시 status='scored', 종합 밴드·총점 표시
```

**리포트 구성**
1. 종합 밴드 + 0–120 총점 + CEFR (셋 다)
2. 영역별 밴드 · 라우팅 결과 공개(§9) · 목표 점수 대비 갭
3. 문항별 정오 + 한국어 해설 + **해설 영상 딥링크**(`explanation_video_start_sec`)
4. 약점 skill_tag Top3 → `skill_drill` 바로가기
5. 오답 어휘 → FSRS 복습 큐 자동 삽입 안내

**정오 표시는 색상 단독 금지.** 아이콘(✓/✗) + 텍스트 병기.

---

## 14. AI 채점 파이프라인

### Writing
```
제출 → 큐 → Claude 루브릭 호출 → JSON 파싱 → toefl_ai_score 저장 → 리포트 갱신
```
```json
{ "task_achievement":4, "coherence":3.5, "lexical_resource":4, "grammar":3.5,
  "overall_band":4.0,
  "feedback_ko":"요구 항목 3개 중 2개만 다뤘습니다. …",
  "strengths":["…"], "improvements":["…"],
  "corrected_excerpts":[{"original":"…","corrected":"…","reason_ko":"…"}] }
```

### Speaking
```
녹음 → STT → listen_and_repeat: target_sentence와 단어 단위 정렬 정확도
            take_an_interview: Claude 루브릭 3지표
```
- STT는 발음 평가를 대체할 수 없다. Delivery 점수는 **참고용**으로 UI에 명시.
- 무음/미응답은 0점.

### [C8] pending_manual = 정식 상품 경로

실패 처리용 상태가 아니라 **1:1 첨삭 상품의 진입점**으로 설계한다. 대형 플랫폼이 구조적으로 못 하는 영역이고, 1인 운영의 실제 차별점이다.

- 학생이 "선생님 첨삭 요청" 버튼 → `status='pending_manual'`
- 관리자 큐(`/admin/toefl/reviews`)에 노출 → 첨삭 등록 시 `manual_scored`
- 리포트에 AI 점수와 사람 첨삭을 **나란히** 표시 (덮어쓰지 않는다)
- AI 채점 실패도 같은 큐로 유입 → 실패가 학생에게 보이지 않는다

**공통**: AI 호출 재시도 2회. 채점 실패가 리포트 전체를 막지 않는다.

---

## 15. 접근성 규격 [C7]

v1은 3줄이라 실제로 무시됐다. 아래는 **테스트 가능한 요구사항**이다.

| # | 요구 | 검증 방법 |
|---|---|---|
| A1 | **핀치 줌 차단 금지.** `user-scalable=no`, `maximum-scale=1` 사용 금지 | viewport 메타 태그 검사 |
| A2 | 지문 폰트 크기 3단계 조절 버튼 (기본/크게/아주 크게), 선택값 유지 | 수동 |
| A3 | 연습 모드에서 오디오 스크립트 동시 표시 토글 (`full` 모드에서는 비활성) | 수동 |
| A4 | 타이머 경고 = 색상 + 텍스트 + `aria-live="polite"` | 스크린리더 |
| A5 | 정오·밴드 표시에 색상 단독 사용 금지, 아이콘/텍스트 병기 | 흑백 출력 테스트 |
| A6 | 마이크 권한 거부 시 "Speaking 제외하고 3개 영역 응시" 경로 제공 | E2E |
| A7 | 키보드만으로 전 문항 조작 가능 (선택지 이동·선택·다음 문항) | 마우스 미사용 E2E |
| A8 | 모든 이미지·오디오 컨트롤에 라벨, 자동재생 오디오는 시작 전 고지 | axe-core |
| A9 | 대비비 4.5:1 이상 (지문 본문 포함) | axe-core CI |

> A1은 경쟁 서비스가 실제로 위반하고 있는 항목이다. 600~700단어 학술 지문을 읽는 서비스에서 확대를 막으면 저시력 사용자를 배제한다. **따라 하지 않는다.**

---

## 16. 기존 어휘 시스템 연동

- `toefl_item.vocab_ids` → 어휘 DB 단어 ID 배열
- 오답 시 연결 단어를 **FSRS 복습 큐에 자동 삽입** (기존 스케줄러 재사용, 신규 구현 금지)
- `complete_the_words` 오답은 confusion pair 후보로 기록
- 어휘 5단계 사다리 ↔ TOEFL 밴드 매핑을 `toefl_vocab_level_map`에 저장 (L1≈밴드2, L5≈밴드5.5, 조정 가능)

---

## 17. 구현 순서 & Claude Code 프롬프트

| Phase | 범위 | DoD |
|---|---|---|
| P0 | 스키마 + RLS + 게스트 승계 + 시드 1폼 | `supabase db reset` 통과, 타입 에러 0 |
| P1 | Reading 3유형 + 라우팅 + 채점 + 진입 3화면 | Reading E2E 통과 |
| P2 | Listening 4유형 + 오디오 규칙 | 재생 1회·뒤로가기 차단 테스트 통과 |
| P3 | Writing 3유형 + AI 루브릭 + 리포트 점진 공개 | 3과제 → 4지표 피드백 생성 |
| P4 | Speaking 2유형 + 녹음/STT | 녹음→전사→점수 E2E 통과 |
| P5 | 풀 모의고사 + 통합 리포트 + 어휘 연동 + 수동 첨삭 큐 | 90분 완주, 총점/밴드/CEFR 표시 |
| P6 | 관리자 문항 등록·검수 UI + 접근성 감사 | 비개발자가 문항 20개 등록, axe-core 통과 |

(Phase별 상세 프롬프트는 원문 그대로이며, 채택 시점에 다시 옮겨적을 것 — 지금은 생략.)

---

## 18. 금지 사항

1. 시간·문항수·라우팅 임계값 하드코딩 금지 → 전부 블루프린트 테이블
2. 정답·해설·스크립트를 응시 중 클라이언트로 전송 금지
3. 타이머·라우팅·채점을 클라이언트에서 계산 금지
4. §7 payload/answer_key 구조 임의 변형 금지
5. 기존 어휘/FSRS 스케줄러 재구현 금지 — 재사용
6. ETS 실제 콘텐츠 사용 금지
7. localStorage를 응시 상태의 단일 저장소로 사용 금지
8. 4개 영역 동시 구현 금지
9. **`user-scalable=no` / `maximum-scale=1` 사용 금지** (§15 A1)
10. **사람 첨삭이 AI 점수를 덮어쓰지 않는다** — 병기 (§14)

---

## 19. 검증 체크리스트

**채점**
- [ ] multi_select 부분점수 규칙 동작
- [ ] easy 경로 밴드 상한 4.0 적용
- [ ] build_a_sentence accepted_alternatives 인정
- [ ] complete_the_words 대소문자·공백 무시

**세션**
- [ ] 시간 만료 후 제출 답안 서버 거부
- [ ] 새로고침 후 잔여 시간·답안 복구
- [ ] Listening 재생 1회 제한, 뒤로 가기 차단
- [ ] 네트워크 끊김 복구 시 답안 유실 없음
- [ ] 진행 중 응시가 대시보드에 노출

**진입·게이팅**
- [ ] 비로그인 상태에서 task_practice 3회 응시 가능
- [ ] 가입 시 게스트 이력 승계
- [ ] 게스트가 full/section 모드 접근 시 차단

**보안**
- [ ] 네트워크 탭에 정답·스크립트 노출 없음
- [ ] 타인 attempt 조회 RLS 차단
- [ ] 타인 guest_token 위조 시 차단
- [ ] 녹음 파일 타인 접근 불가

**채점 UX**
- [ ] 제출 직후 R/L 점수 즉시 표시
- [ ] W/S 채점 중 자리표시자 + 자동 갱신
- [ ] 채점 실패해도 나머지 리포트 정상
- [ ] 리포트에 라우팅 결과와 상한 안내 표시

**접근성 (§15)**
- [ ] A1 핀치 줌 가능
- [ ] A4 타이머 경고 3중
- [ ] A5 흑백 출력에서 정오 구분 가능
- [ ] A6 마이크 없이 3개 영역 응시 가능
- [ ] A7 키보드만으로 전 문항 조작
- [ ] A9 axe-core 위반 0건

---

*v2 — 2026-08. 블루프린트 수치는 ETS 공식 Test Blueprint 확인 후 `toefl_form_blueprint` 시드만 교체할 것.*
