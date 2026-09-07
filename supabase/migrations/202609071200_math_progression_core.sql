-- 수학 학습 진행 구조 PG0: 진행 스키마 (RUN_MATH_PROGRESSION.md PG0)
--
-- 지시서 원문 SQL은 unit_id/problem_id를 bigint로 가정했지만, PG-A(202609071000_math_progression_prep.sql)
-- 에서 이미 확인한 대로 curriculum_units.id / problems.id는 uuid다 — 여기서도 FK 타입을 uuid로
-- 정정했다(A-2와 같은 사유). profiles.id도 uuid(auth.users FK, supabase/profiles.sql)라 user_id류
-- 컬럼도 전부 uuid. math_sessions.id / entitlement_grants.id는 새로 만드는 내부 PK라 지시서대로
-- bigserial 유지.
--
-- 0-2 관련 발견(2026-09-07, 사용자 확인): question_attempts에는 이미 is_correct/elapsed_seconds/
-- source 컬럼이 있다. is_correct·elapsed_seconds는 지시서 의도와 그대로 맞아 재사용. 단 source는
-- worksheets 제출 흐름(src/lib/question-attempts.ts)이 이미 source='worksheet'로 실사용 중이라,
-- 지시서의 CHECK(source in ('self','lesson'))는 걸지 않기로 함(사용자 결정) — 이 컬럼은 계속 자유
-- text로 두고, 통계 제외(source='lesson')는 앱/뷰 단에서 필터링한다. 컬럼명도 user_id가 아니라
-- student_id라 그대로 사용.
--
-- RLS: 학생은 본인 행 select만(쓰기 정책 없음 — 상태 갱신은 PG1에서 service role 서버 라우트로만
-- 한다), staff는 is_staff()(supabase/roles-tier.sql)로 조회/관리. math_unit_prereqs만 인증 사용자
-- 전체 select 허용(선수관계는 비공개 정보가 아님, 학생 화면에서 커리큘럼 맵을 그리려면 필요).
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전(idempotent)합니다.

create table if not exists math_unit_prereqs (
  unit_id uuid not null references curriculum_units(id) on delete cascade,
  requires_unit_id uuid not null references curriculum_units(id) on delete cascade,
  primary key (unit_id, requires_unit_id),
  check (unit_id <> requires_unit_id)
);

create table if not exists math_unit_states (
  user_id uuid not null references profiles(id) on delete cascade,
  unit_id uuid not null references curriculum_units(id) on delete cascade,
  status text not null default 'locked'
    check (status in ('locked', 'available', 'in_progress', 'mastered')),
  mastery_score numeric(4, 3),
  first_try_accuracy numeric(4, 3),
  items_attempted int not null default 0,
  consecutive_failed_sessions int not null default 0,
  last_practiced_at timestamptz,
  next_review_at timestamptz,
  fsrs_stability real,
  fsrs_difficulty real,
  fsrs_reps int not null default 0,
  fsrs_lapses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);
create index if not exists math_unit_states_review_idx
  on math_unit_states (user_id, next_review_at)
  where status = 'mastered';

create table if not exists math_sessions (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  unit_id uuid not null references curriculum_units(id),
  kind text not null check (kind in ('practice', 'review', 'diagnostic', 'lesson')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  item_count int not null,
  correct_count int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists math_sessions_one_active_idx
  on math_sessions (user_id)
  where status = 'in_progress';

create table if not exists math_session_items (
  session_id bigint not null references math_sessions(id) on delete cascade,
  position int not null,
  problem_id uuid not null references problems(id),
  primary key (session_id, position)
);

create table if not exists math_placements (
  user_id uuid primary key references profiles(id) on delete cascade,
  curriculum_group text not null,
  curriculum_detail text,
  exempted_unit_ids uuid[] not null default '{}',
  completed_at timestamptz
);

create table if not exists math_daily_activity (
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  sessions_done int not null default 0,
  items_done int not null default 0,
  primary key (user_id, date)
);

-- 결제 도입 전 임시 권한 부여(오프라인 학원 수강생) — src/lib/access/entitlement.ts(PG1)가 참조
create table if not exists entitlement_grants (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  note text
);
create index if not exists entitlement_grants_active_idx
  on entitlement_grants (user_id, feature_key)
  where revoked_at is null;

-- ---------------------------------------------------------------------
-- 0-2. 기존 테이블 확장
-- ---------------------------------------------------------------------
alter table question_attempts
  add column if not exists session_id bigint references math_sessions(id) on delete set null;

update question_attempts set source = 'self' where source is null;
alter table question_attempts alter column source set default 'self';
alter table question_attempts alter column source set not null;

create index if not exists question_attempts_student_unit_attempt_idx
  on question_attempts (student_id, unit_id, attempt_no);

-- ---------------------------------------------------------------------
-- 0-3. math_unit_prereqs 순환 참조 방지 트리거
-- ---------------------------------------------------------------------
-- 행(unit_id=A, requires_unit_id=B)은 "A를 하려면 B가 먼저 필요"를 뜻한다(A -> B 의존).
-- 새 edge A->B를 넣기 전에, B에서 기존 edge를 따라갔을 때 이미 A에 도달할 수 있으면(즉 B가
-- 이미 A를 필요로 하는 체인이 있으면) A->B를 더하는 순간 사이클이 생기므로 거부한다.
create or replace function math_check_unit_prereq_cycle()
returns trigger language plpgsql as $fn$
begin
  if exists (
    with recursive reachable(unit_id) as (
      select requires_unit_id from math_unit_prereqs where unit_id = new.requires_unit_id
      union
      select p.requires_unit_id
      from math_unit_prereqs p
      join reachable r on p.unit_id = r.unit_id
    )
    select 1 from reachable where unit_id = new.unit_id
  ) then
    raise exception 'math_unit_prereqs cycle detected: % already (transitively) requires %', new.requires_unit_id, new.unit_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists math_unit_prereqs_cycle_guard on math_unit_prereqs;
create trigger math_unit_prereqs_cycle_guard
  before insert or update on math_unit_prereqs
  for each row execute function math_check_unit_prereq_cycle();

-- ---------------------------------------------------------------------
-- 0-4. RLS
-- ---------------------------------------------------------------------
alter table math_unit_prereqs enable row level security;
drop policy if exists "authenticated view unit prereqs" on math_unit_prereqs;
create policy "authenticated view unit prereqs" on math_unit_prereqs
  for select to authenticated using (true);
drop policy if exists "staff manage unit prereqs" on math_unit_prereqs;
create policy "staff manage unit prereqs" on math_unit_prereqs
  for all using (is_staff()) with check (is_staff());

alter table math_unit_states enable row level security;
drop policy if exists "student view own unit states" on math_unit_states;
create policy "student view own unit states" on math_unit_states
  for select using (user_id = auth.uid());
drop policy if exists "staff view unit states" on math_unit_states;
create policy "staff view unit states" on math_unit_states
  for select using (is_staff());

alter table math_sessions enable row level security;
drop policy if exists "student view own sessions" on math_sessions;
create policy "student view own sessions" on math_sessions
  for select using (user_id = auth.uid());
drop policy if exists "staff view sessions" on math_sessions;
create policy "staff view sessions" on math_sessions
  for select using (is_staff());

alter table math_session_items enable row level security;
drop policy if exists "student view own session items" on math_session_items;
create policy "student view own session items" on math_session_items
  for select using (
    exists (select 1 from math_sessions s where s.id = session_id and s.user_id = auth.uid())
  );
drop policy if exists "staff view session items" on math_session_items;
create policy "staff view session items" on math_session_items
  for select using (is_staff());

alter table math_placements enable row level security;
drop policy if exists "student view own placement" on math_placements;
create policy "student view own placement" on math_placements
  for select using (user_id = auth.uid());
drop policy if exists "staff manage placements" on math_placements;
create policy "staff manage placements" on math_placements
  for all using (is_staff()) with check (is_staff());

alter table math_daily_activity enable row level security;
drop policy if exists "student view own daily activity" on math_daily_activity;
create policy "student view own daily activity" on math_daily_activity
  for select using (user_id = auth.uid());
drop policy if exists "staff view daily activity" on math_daily_activity;
create policy "staff view daily activity" on math_daily_activity
  for select using (is_staff());

alter table entitlement_grants enable row level security;
drop policy if exists "student view own grants" on entitlement_grants;
create policy "student view own grants" on entitlement_grants
  for select using (user_id = auth.uid());
drop policy if exists "staff manage grants" on entitlement_grants;
create policy "staff manage grants" on entitlement_grants
  for all using (is_staff()) with check (is_staff());
