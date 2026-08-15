-- TOEFL 4개 영역 모듈 — P0: 스키마 (docs/toefl-spec.md §5 그대로)
-- 되돌리려면: 아래 테이블/타입을 역순으로 drop하는 새 마이그레이션을 추가할 것(이 파일은 수정하지 않음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

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
  payload       jsonb not null,              -- 유형별 구조: spec §6
  answer_key    jsonb,                       -- ai_rubric이면 null 허용
  explanation_ko text,                       -- 한국어 해설 (필수)
  explanation_en text,
  skill_tags    text[] default '{}',         -- {'inference','vocab_in_context'}
  vocab_ids     uuid[] default '{}',         -- 기존 어휘 DB 연동 (spec §13)
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
  deadline_at   timestamptz,                 -- 서버 권위 타이머 (spec §11)
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
  answer        jsonb,                       -- 유형별 구조: spec §6
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

-- ============ 어휘 레벨 ↔ TOEFL 밴드 매핑 (spec §13) ============
create table toefl_vocab_level_map (
  id            uuid primary key default gen_random_uuid(),
  vocab_level   smallint not null unique,    -- 기존 단어 완전학습 Lv0~5
  min_band      numeric(2,1) not null
);

-- ============ 학생용 뷰: 정답·해설·오디오 스크립트 제외 (spec §5 RLS 요구사항) ============
-- 기본 테이블(toefl_item/toefl_stimulus)은 RLS로 직원(is_staff)만 접근 가능하게 잠근다(다음 마이그레이션).
-- 이 뷰들은 "일반 뷰"(정의자 권한으로 실행)라서 RLS를 우회해 기본 테이블을 읽되,
-- 아래 WHERE로 "공개된(is_published) 폼에 속한 것만" 직접 제한하고, 민감 컬럼(answer_key,
-- explanation_*, transcript)은 SELECT 목록에서 아예 뺀다. 학생 접근은 GRANT로 이 뷰에만 허용한다.
create view toefl_item_public as
  select ti.id, ti.module_id, ti.stimulus_id, ti.task_type, ti.position, ti.difficulty,
         ti.points, ti.scoring_mode, ti.prompt, ti.payload, ti.created_at
  from toefl_item ti
  join toefl_module tm on tm.id = ti.module_id
  join toefl_form tf on tf.id = tm.form_id
  where tf.is_published = true;

create view toefl_stimulus_public as
  select ts.id, ts.module_id, ts.task_type, ts.title, ts.body, ts.audio_path,
         ts.audio_duration_sec, ts.image_path, ts.position, ts.metadata
  from toefl_stimulus ts
  join toefl_module tm on tm.id = ts.module_id
  join toefl_form tf on tf.id = tm.form_id
  where tf.is_published = true;
  -- transcript 컬럼 제외 (응시 중 노출 금지, spec §5)
