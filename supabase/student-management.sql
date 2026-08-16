-- 학생관리 확장: 보호자 연락처 · 학생 목표 · 상담 기록 · 수업 관찰노트.
-- 학생 정체성은 새 테이블을 안 만들고 기존 profiles(id)를 그대로 student_id로 쓴다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다(additive).

create extension if not exists "pgcrypto";

do $$ begin
  create type guardian_relation as enum ('father', 'mother', 'grandparent', 'sibling', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type consultation_kind as enum ('intake', 'regular', 'issue', 'parent_request', 'exit');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 보호자
-- ---------------------------------------------------------------------
create table if not exists guardians (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  phone                   text,
  email                   text,
  kakao_linked            boolean not null default false,
  report_consent          boolean not null default false,
  consent_at              timestamptz,
  preferred_contact_time  text,
  created_at              timestamptz not null default now()
);

create table if not exists student_guardians (
  student_id  uuid not null references profiles(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  relation    guardian_relation not null,
  is_primary  boolean not null default false,
  primary key (student_id, guardian_id)
);

-- ---------------------------------------------------------------------
-- 학생 목표
-- ---------------------------------------------------------------------
create table if not exists student_goals (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references profiles(id) on delete cascade,
  goal_text    text not null,
  target_score text,
  target_date  date,
  achieved     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists student_goals_student_idx on student_goals (student_id);

-- ---------------------------------------------------------------------
-- 상담 기록
-- ---------------------------------------------------------------------
create table if not exists consultations (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references profiles(id) on delete cascade,
  kind              consultation_kind not null,
  held_at           timestamptz not null default now(),
  participants      text,
  summary           text not null,
  action_items      text,
  next_due_on       date,
  visible_to_parent boolean not null default false,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists consultations_student_idx on consultations (student_id, held_at desc);

-- ---------------------------------------------------------------------
-- 수업 관찰노트
-- ---------------------------------------------------------------------
create table if not exists student_notes (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references profiles(id) on delete cascade,
  condition_score       smallint check (condition_score between 1 and 4),
  focus_score           smallint check (focus_score between 1 and 5),
  understanding_score   smallint check (understanding_score between 1 and 5),
  activity_score        smallint check (activity_score between 1 and 5),
  homework_state        text,
  unit_covered          text,
  stuck_point           text,
  next_plan             text,
  share_with_parent     boolean not null default false,
  created_by            uuid references profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);
create index if not exists student_notes_student_idx on student_notes (student_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS — 이 프로젝트의 is_staff()/is_admin() 패턴 그대로 따른다 (user_roles 테이블 없음).
-- ---------------------------------------------------------------------
alter table guardians          enable row level security;
alter table student_guardians  enable row level security;
alter table student_goals      enable row level security;
alter table consultations      enable row level security;
alter table student_notes      enable row level security;

-- 보호자: 직원 전원 관리, 본인(학생) 조회 가능
drop policy if exists "staff manage guardians" on guardians;
create policy "staff manage guardians" on guardians
  for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage student_guardians" on student_guardians;
create policy "staff manage student_guardians" on student_guardians
  for all using (is_staff()) with check (is_staff());

drop policy if exists "student view own guardians" on student_guardians;
create policy "student view own guardians" on student_guardians
  for select using (student_id = auth.uid());

-- 학생 목표: 직원 전원 관리, 본인 조회 가능(목표는 학생이 봐도 되는 정보)
drop policy if exists "staff manage student_goals" on student_goals;
create policy "staff manage student_goals" on student_goals
  for all using (is_staff()) with check (is_staff());

drop policy if exists "student view own goals" on student_goals;
create policy "student view own goals" on student_goals
  for select using (student_id = auth.uid());

-- 상담·관찰노트: 직원 전원만(학생·학부모에게 비공개 — 붙여넣은 스키마 원안 그대로)
drop policy if exists "staff manage consultations" on consultations;
create policy "staff manage consultations" on consultations
  for all using (is_staff()) with check (is_staff());

drop policy if exists "staff manage student_notes" on student_notes;
create policy "staff manage student_notes" on student_notes
  for all using (is_staff()) with check (is_staff());

grant select, insert, update, delete on guardians, student_guardians, student_goals, consultations, student_notes
  to authenticated;

-- 실행 후 확인용
select 'guardians' as table_name, count(*) from guardians
union all select 'student_guardians', count(*) from student_guardians
union all select 'student_goals', count(*) from student_goals
union all select 'consultations', count(*) from consultations
union all select 'student_notes', count(*) from student_notes;
