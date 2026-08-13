-- Stage 1: 영어 단어 완전학습 서브시스템 v2 스키마.
-- CLAUDE.md [영어 서브시스템] 섹션의 용어사전을 따른다 (Lv0~5 사다리, FSRS, 90% 게이트 등).
-- is_admin()/is_staff() 는 supabase/roles-tier.sql 에서 이미 정의됨(전제조건).
--
-- 되돌리는 법: 이 파일이 만든 테이블을 전부 `drop table if exists <이름> cascade;` 로 지운다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

-- ===== 1) 콘텐츠 계층 =====

-- 단어장(커리큘럼 단위). 예: "SAT 기본 300", "중2 내신 1학기"
create table if not exists word_sets (
  id uuid primary key default gen_random_uuid(),
  title_ko text not null,
  title_en text,
  curriculum text not null default 'general', -- general | SAT | TOEFL | IELTS | 수능 | 내신 ...
  level text, -- CEFR 등급 등 자유 텍스트 (예: A1~A2)
  owner_id uuid references auth.users(id) on delete set null,
  is_published boolean not null default false, -- true여야 학생에게 노출
  created_at timestamptz default now()
);

-- 단어장 내부의 순서 있는 챕터. mastery_threshold = 90% 게이트 기준(조정 가능)
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  set_id uuid references word_sets(id) on delete cascade not null,
  position integer not null default 0,
  title text not null,
  mastery_threshold numeric not null default 0.9,
  created_at timestamptz default now()
);
create index if not exists units_set_idx on units (set_id, position);

-- 단어 원형(lemma). 뜻은 word_senses 로 분리(다의어 대비)
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  lemma text not null unique, -- 단어 원형은 한 행. 다의어는 word_senses로 구분(중복 행 만들지 않음)
  pos text, -- 품사 (n., v., adj., adv. ...)
  ipa text, -- 발음기호
  cefr text, -- 추정 난이도 A1~C2
  freq_rank integer, -- 사용 빈도 순위(있으면)
  audio_url text,
  source text not null default 'manual', -- manual | ai
  is_reviewed boolean not null default false, -- 검수 전엔 학생에게 노출 안 됨
  created_at timestamptz default now()
);
create index if not exists words_lemma_idx on words (lemma);
create index if not exists words_reviewed_idx on words (is_reviewed);

create table if not exists word_senses (
  id uuid primary key default gen_random_uuid(),
  word_id uuid references words(id) on delete cascade not null,
  meaning_ko text not null,
  meaning_en text, -- 영영 정의
  position integer not null default 0,
  is_reviewed boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists word_senses_word_idx on word_senses (word_id, position);

-- 유닛에 담긴 단어(순서 포함)
create table if not exists unit_words (
  unit_id uuid references units(id) on delete cascade not null,
  word_id uuid references words(id) on delete cascade not null,
  position integer not null default 0,
  primary key (unit_id, word_id)
);

create table if not exists examples (
  id uuid primary key default gen_random_uuid(),
  word_id uuid references words(id) on delete cascade not null,
  sense_id uuid references word_senses(id) on delete set null,
  text_en text not null,
  text_ko text,
  source text not null default 'manual', -- seed | manual | ai
  is_reviewed boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists examples_word_idx on examples (word_id);

create table if not exists collocations (
  id uuid primary key default gen_random_uuid(),
  word_id uuid references words(id) on delete cascade not null,
  pattern text not null, -- 예: "make a decision"
  example text,
  created_at timestamptz default now()
);
create index if not exists collocations_word_idx on collocations (word_id);

-- 어원 지식 그래프의 노드(접두사/어근/접미사)
create table if not exists morphemes (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('root', 'prefix', 'suffix')),
  form text not null, -- 예: "spect"
  meaning_ko text,
  meaning_en text,
  origin text, -- 예: "Latin"
  created_at timestamptz default now()
);

create table if not exists word_morphemes (
  word_id uuid references words(id) on delete cascade not null,
  morpheme_id uuid references morphemes(id) on delete cascade not null,
  primary key (word_id, morpheme_id)
);

-- ===== 2) 학생별 학습 상태 =====

-- 학생별 단어 숙련도. level=5단계 사다리, stability/difficulty/due_at=FSRS. 두 축은 직교.
create table if not exists user_word_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  word_id uuid references words(id) on delete cascade not null,
  level integer not null default 0 check (level between 0 and 5),
  stability numeric,
  difficulty numeric,
  due_at timestamptz default now(), -- FSRS: 다음 복습 시각
  consecutive_correct integer not null default 0,
  lapses integer not null default 0,
  last_reviewed_at timestamptz,
  last_item_type text,
  updated_at timestamptz default now(),
  unique (user_id, word_id)
);
create index if not exists user_word_states_due_idx on user_word_states (user_id, due_at);

-- 문항 응시 기록 하나하나(오답 분석·혼동쌍 탐지의 원천 데이터)
create table if not exists review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  word_id uuid references words(id) on delete cascade not null,
  item_type text not null,
  is_correct boolean not null,
  chosen_option_id text, -- 오답으로 고른 것의 식별자(문항 유형에 따라 word id 등)
  response_ms integer,
  derived_rating text, -- again | hard | good | easy
  created_at timestamptz default now()
);
create index if not exists review_logs_user_idx on review_logs (user_id, created_at desc);
create index if not exists review_logs_word_idx on review_logs (word_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  mode text not null check (mode in ('learn', 'review', 'corrective', 'test', 'speed')),
  unit_id uuid references units(id) on delete set null,
  started_at timestamptz default now(),
  ended_at timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id, started_at desc);

create table if not exists session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade not null,
  word_id uuid references words(id) on delete cascade not null,
  item_type text not null,
  is_correct boolean,
  response_ms integer,
  position integer not null default 0
);
create index if not exists session_items_session_idx on session_items (session_id, position);

-- 유닛별 90% 게이트 통과 상태
create table if not exists unit_progress (
  user_id uuid references auth.users(id) on delete cascade not null,
  unit_id uuid references units(id) on delete cascade not null,
  mastery_ratio numeric not null default 0,
  test_score numeric,
  status text not null default 'locked' check (status in ('locked', 'in_progress', 'passed')),
  cycle_count integer not null default 0, -- 교정학습 반복 횟수(최대 3)
  updated_at timestamptz default now(),
  primary key (user_id, unit_id)
);

-- 혼동쌍. user_id = null 이면 콜드스타트용 시드(전체 학생 공통), 있으면 개인화.
create table if not exists confusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  word_id uuid references words(id) on delete cascade not null,
  confused_with_word_id uuid references words(id) on delete cascade not null,
  count integer not null default 1,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  unique (user_id, word_id, confused_with_word_id)
);
create index if not exists confusions_user_idx on confusions (user_id, word_id);

-- AI 생성 결과 캐시(같은 입력 재과금 방지)
create table if not exists ai_generations (
  id uuid primary key default gen_random_uuid(),
  kind text not null, -- word_generation | sentence_grading | personalized_example
  input_hash text not null,
  model text not null,
  output_json jsonb not null,
  created_at timestamptz default now(),
  unique (kind, input_hash, model)
);

-- ===== 3) 보안 정책(RLS) =====
-- MVP 노출 규칙: is_published(단어장) + is_reviewed(단어/뜻/예문) 인 콘텐츠는
-- 로그인한 학생 누구나 열람 가능(수학 강좌 공개 방식과 동일). 반/배정(classes)은 Stage 8.

alter table word_sets enable row level security;
alter table units enable row level security;
alter table words enable row level security;
alter table word_senses enable row level security;
alter table unit_words enable row level security;
alter table examples enable row level security;
alter table collocations enable row level security;
alter table morphemes enable row level security;
alter table word_morphemes enable row level security;
alter table user_word_states enable row level security;
alter table review_logs enable row level security;
alter table sessions enable row level security;
alter table session_items enable row level security;
alter table unit_progress enable row level security;
alter table confusions enable row level security;
alter table ai_generations enable row level security;

-- 콘텐츠: 직원 전체 관리, 학생은 공개+검수된 것만 조회
drop policy if exists "staff manage word_sets" on word_sets;
create policy "staff manage word_sets" on word_sets for all using (is_staff()) with check (is_staff());
drop policy if exists "students view published word_sets" on word_sets;
create policy "students view published word_sets" on word_sets for select using (is_published = true);

drop policy if exists "staff manage units" on units;
create policy "staff manage units" on units for all using (is_staff()) with check (is_staff());
drop policy if exists "students view units of published sets" on units;
create policy "students view units of published sets" on units for select using (
  exists (select 1 from word_sets s where s.id = units.set_id and s.is_published = true)
);

drop policy if exists "staff manage words" on words;
create policy "staff manage words" on words for all using (is_staff()) with check (is_staff());
drop policy if exists "students view reviewed words" on words;
create policy "students view reviewed words" on words for select using (is_reviewed = true);

drop policy if exists "staff manage word_senses" on word_senses;
create policy "staff manage word_senses" on word_senses for all using (is_staff()) with check (is_staff());
drop policy if exists "students view reviewed word_senses" on word_senses;
create policy "students view reviewed word_senses" on word_senses for select using (is_reviewed = true);

drop policy if exists "staff manage unit_words" on unit_words;
create policy "staff manage unit_words" on unit_words for all using (is_staff()) with check (is_staff());
drop policy if exists "students view unit_words of published sets" on unit_words;
create policy "students view unit_words of published sets" on unit_words for select using (
  exists (
    select 1 from units u join word_sets s on s.id = u.set_id
    where u.id = unit_words.unit_id and s.is_published = true
  )
);

drop policy if exists "staff manage examples" on examples;
create policy "staff manage examples" on examples for all using (is_staff()) with check (is_staff());
drop policy if exists "students view reviewed examples" on examples;
create policy "students view reviewed examples" on examples for select using (is_reviewed = true);

drop policy if exists "staff manage collocations" on collocations;
create policy "staff manage collocations" on collocations for all using (is_staff()) with check (is_staff());
drop policy if exists "authenticated view collocations" on collocations;
create policy "authenticated view collocations" on collocations for select using (auth.uid() is not null);

drop policy if exists "staff manage morphemes" on morphemes;
create policy "staff manage morphemes" on morphemes for all using (is_staff()) with check (is_staff());
drop policy if exists "authenticated view morphemes" on morphemes;
create policy "authenticated view morphemes" on morphemes for select using (auth.uid() is not null);

drop policy if exists "staff manage word_morphemes" on word_morphemes;
create policy "staff manage word_morphemes" on word_morphemes for all using (is_staff()) with check (is_staff());
drop policy if exists "authenticated view word_morphemes" on word_morphemes;
create policy "authenticated view word_morphemes" on word_morphemes for select using (auth.uid() is not null);

-- 학습 상태: 학생 본인 관리, 직원은 조회만(리포트·모니터링용)
drop policy if exists "students manage own word_states" on user_word_states;
create policy "students manage own word_states" on user_word_states for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff view word_states" on user_word_states;
create policy "staff view word_states" on user_word_states for select using (is_staff());

drop policy if exists "students manage own review_logs" on review_logs;
create policy "students manage own review_logs" on review_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff view review_logs" on review_logs;
create policy "staff view review_logs" on review_logs for select using (is_staff());

drop policy if exists "students manage own sessions" on sessions;
create policy "students manage own sessions" on sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff view sessions" on sessions;
create policy "staff view sessions" on sessions for select using (is_staff());

drop policy if exists "students manage own session_items" on session_items;
create policy "students manage own session_items" on session_items for all using (
  exists (select 1 from sessions s where s.id = session_items.session_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from sessions s where s.id = session_items.session_id and s.user_id = auth.uid())
);
drop policy if exists "staff view session_items" on session_items;
create policy "staff view session_items" on session_items for select using (is_staff());

drop policy if exists "students manage own unit_progress" on unit_progress;
create policy "students manage own unit_progress" on unit_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff view unit_progress" on unit_progress;
create policy "staff view unit_progress" on unit_progress for select using (is_staff());

-- 혼동쌍: 학생은 자기 것 + 시드(user_id null)를 보되, 쓰기는 직원/시스템만
drop policy if exists "staff manage confusions" on confusions;
create policy "staff manage confusions" on confusions for all using (is_staff()) with check (is_staff());
drop policy if exists "students view own and seed confusions" on confusions;
create policy "students view own and seed confusions" on confusions for select using (
  user_id = auth.uid() or user_id is null
);
drop policy if exists "students insert own confusions" on confusions;
create policy "students insert own confusions" on confusions for insert with check (user_id = auth.uid());

-- AI 생성 캐시: 직원 전용(시스템 캐시, 학생 직접 접근 불필요)
drop policy if exists "staff manage ai_generations" on ai_generations;
create policy "staff manage ai_generations" on ai_generations for all using (is_staff()) with check (is_staff());

-- ===== 4) 권한 부여 =====
grant select, insert, update, delete on word_sets, units, words, word_senses, unit_words,
  examples, collocations, morphemes, word_morphemes,
  user_word_states, review_logs, sessions, session_items, unit_progress, confusions, ai_generations
  to authenticated;
