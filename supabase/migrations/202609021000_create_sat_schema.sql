-- SAT P0: 스키마 (지시서 "SAT P0 — 스키마 · 스킬 체계 · 채점 함수" §2)
-- 스킬/도메인 값은 src/lib/sat/taxonomy.ts 와 반드시 일치시킨다(문자 하나도 다르면 안 됨).
-- 되돌리려면: 아래 테이블/타입을 역순으로 drop하는 새 마이그레이션을 추가할 것(이 파일은 수정하지 않음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

-- ============ ENUMS ============
create type sat_section as enum ('rw', 'math');
create type sat_format as enum ('mcq', 'spr');
create type sat_source as enum ('ai', 'manual', 'seed');
create type sat_attempt_mode as enum ('full', 'section_practice');
create type sat_attempt_status as enum ('in_progress', 'submitted', 'scored', 'abandoned');

-- ============ 시험지 골격 (P0는 뼈대만 — 조립 로직은 이후 단계) ============
create table sat_forms (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  title        text not null,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

create table sat_form_modules (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references sat_forms(id) on delete cascade,
  section       sat_section not null,
  module_number smallint not null check (module_number in (1, 2)),
  position      int not null,
  unique (form_id, section, module_number)
);

-- ============ 콘텐츠: 지문 (RW 전용. 소재당 문항 1개 원칙 — 지시서 SAT P1 §1) ============
create table sat_stimuli (
  id           uuid primary key default gen_random_uuid(),
  domain       text not null check (domain in (
    'information_ideas', 'craft_structure', 'expression_of_ideas', 'standard_conventions'
  )),
  passage_text text not null,
  verified     boolean not null default false,
  source       sat_source not null default 'manual',
  batch_id     uuid not null,
  reviewed_by  uuid references profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index sat_stimuli_review_queue_idx on sat_stimuli (verified, created_at desc) where verified = false;
create index sat_stimuli_batch_idx on sat_stimuli (batch_id);

-- ============ 콘텐츠: 문항 (RW + Math 공용 뱅크. 아직 폼/모듈에 배정되지 않는다 — 배정은 이후 단계) ============
create table sat_questions (
  id             uuid primary key default gen_random_uuid(),
  stimulus_id    uuid references sat_stimuli(id) on delete cascade, -- RW만 사용, Math는 null
  section        sat_section not null,
  domain         text not null check (domain in (
    'information_ideas', 'craft_structure', 'expression_of_ideas', 'standard_conventions',
    'algebra', 'advanced_math', 'problem_solving_data', 'geometry_trig'
  )),
  skill          text not null check (skill in (
    -- Reading and Writing (11)
    'central_ideas', 'command_of_evidence_text', 'command_of_evidence_quant', 'inferences',
    'words_in_context', 'text_structure_purpose', 'cross_text_connections',
    'rhetorical_synthesis', 'transitions', 'boundaries', 'form_structure_sense',
    -- Math (19)
    'linear_eq_1var', 'linear_eq_2var', 'linear_functions', 'systems_linear', 'linear_inequalities',
    'equivalent_expressions', 'nonlinear_eq_systems', 'nonlinear_functions',
    'ratios_rates_units', 'percentages', 'one_var_data', 'two_var_data_scatter', 'probability',
    'sample_inference_moe', 'evaluating_claims',
    'area_volume', 'lines_angles_triangles', 'right_tri_trig', 'circles'
  )),
  difficulty     smallint not null check (difficulty between 1 and 5),
  format         sat_format not null,
  prompt         text not null,
  -- 유형별 구조(선택지, 도형 스펙 등). 렌더링 스펙은 SAT P1(생성 파이프라인)에서 채운다.
  payload        jsonb not null default '{}'::jsonb,
  -- mcq: {"type":"mcq","correct":"B"}
  -- spr: {"type":"spr","accepted":[{"n":"7","d":"2"}, ...],"tolerance":{"min":{...},"max":{...}}|null}
  answer_key     jsonb not null,
  explanation_ko text not null,
  verified       boolean not null default false,
  source         sat_source not null default 'manual',
  batch_id       uuid not null,
  reviewed_by    uuid references profiles(id) on delete set null,
  reviewed_at    timestamptz,
  -- Gate A "보류" 판정 사유(SAT P1 §3). 폐기는 DB에 안 들어오므로 여기 안 남는다.
  gate_flags     text[] not null default '{}',
  created_at     timestamptz not null default now()
);

alter table sat_questions add constraint sat_questions_answer_key_type_matches_format
  check ((answer_key ->> 'type') = format::text);

create index sat_questions_domain_skill_idx on sat_questions (domain, skill);
create index sat_questions_review_queue_idx on sat_questions (verified, created_at desc) where verified = false;
create index sat_questions_batch_idx on sat_questions (batch_id);
create index sat_questions_stimulus_idx on sat_questions (stimulus_id);

-- ============ 응시 ============
create table sat_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  form_id      uuid references sat_forms(id),
  mode         sat_attempt_mode not null,
  status       sat_attempt_status not null default 'in_progress',
  version      int not null default 0, -- 낙관적 잠금
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  scored_at    timestamptz
);
create index sat_attempts_user_idx on sat_attempts (user_id, started_at desc);

create table sat_responses (
  attempt_id        uuid not null references sat_attempts(id) on delete cascade,
  question_id       uuid not null references sat_questions(id),
  -- 학생이 입력한 원문 그대로(SPR: "7/2" 같은 문자열, MCQ: 선택한 보기 키).
  raw_input         text,
  -- SPR 파싱 결과(Rational 직렬화). MCQ는 null.
  normalized        jsonb,
  is_correct        boolean,
  -- SPR 파싱 실패 사유(SprErrorCode). 정답/오답과 별개로 "형식 오류로 틀린 비율" 분석용.
  error_code        text,
  time_spent_ms     int,
  answered_at       timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- ============ 학생용 뷰: 정답·해설·검수 메타데이터 제외 (verified=false 는 어떤 경로로도 노출 금지) ============
create view sat_stimuli_public as
  select id, domain, passage_text
  from sat_stimuli
  where verified = true;

create view sat_questions_public as
  select id, stimulus_id, section, domain, skill, difficulty, format, prompt, payload, created_at
  from sat_questions
  where verified = true;
  -- answer_key, explanation_ko, gate_flags, source, batch_id, reviewed_* 는 의도적으로 제외.
