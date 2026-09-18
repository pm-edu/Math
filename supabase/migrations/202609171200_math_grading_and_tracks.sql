-- RUN_MATH_SITE.md 4단계 — 문항 채점 구조 + 과정(track).
-- 지시서 원문의 bigint 참조는 이 저장소 실제 PK 타입(전부 uuid: worksheets.id/classes.id/
-- problems.id/curriculum_units.id/profiles.id, 2026-09-17 확인)으로 정정했다. 새로 만드는
-- math_tracks/math_track_worksheets/math_track_progress 자체의 PK도 지시서 원문은 bigserial이지만,
-- 이 저장소가 예외 없이 uuid PK만 쓰는 관례(question_attempts.id 정도만 예외)라 uuid로 통일했다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

-- ---------------------------------------------------------------------
-- 4-2. 문항 채점 구조
-- ---------------------------------------------------------------------
alter table problems
  add column if not exists unit_id uuid references curriculum_units(id),
  add column if not exists answer_format text check (answer_format in ('mcq', 'numeric', 'expression', 'free')),
  add column if not exists answer_spec jsonb,
  add column if not exists is_auto_gradable boolean not null default false;

create index if not exists problems_unit_gradable_idx on problems (unit_id)
  where verified = true and is_auto_gradable = true;

-- ---------------------------------------------------------------------
-- 과정(track)
-- ---------------------------------------------------------------------
create table if not exists math_tracks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  curriculum_group text not null,
  description text,
  is_active boolean not null default true
);

create table if not exists math_track_worksheets (
  track_id uuid not null references math_tracks(id) on delete cascade,
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  position int not null,
  primary key (track_id, position),
  unique (track_id, worksheet_id)
);

alter table profiles add column if not exists track_id uuid references math_tracks(id);
alter table classes add column if not exists track_id uuid references math_tracks(id); -- 반 기본 과정

-- ---------------------------------------------------------------------
-- 진행
-- ---------------------------------------------------------------------
create table if not exists math_track_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  worksheet_id uuid not null references worksheets(id) on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'open', 'passed')),
  best_accuracy numeric(4, 3),
  attempts int not null default 0,
  passed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, worksheet_id)
);

-- ---------------------------------------------------------------------
-- 시도 기록 확장 — is_correct/elapsed_seconds/source/session_id는 이미 있어서(확인함) 재사용,
-- worksheet_id만 새로 추가한다.
-- ---------------------------------------------------------------------
alter table question_attempts
  add column if not exists worksheet_id uuid references worksheets(id) on delete set null;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table math_tracks enable row level security;
drop policy if exists "authenticated view tracks" on math_tracks;
create policy "authenticated view tracks" on math_tracks
  for select to authenticated using (true);
drop policy if exists "staff manage tracks" on math_tracks;
create policy "staff manage tracks" on math_tracks
  for all using (is_staff()) with check (is_staff());

alter table math_track_worksheets enable row level security;
drop policy if exists "authenticated view track worksheets" on math_track_worksheets;
create policy "authenticated view track worksheets" on math_track_worksheets
  for select to authenticated using (true);
drop policy if exists "staff manage track worksheets" on math_track_worksheets;
create policy "staff manage track worksheets" on math_track_worksheets
  for all using (is_staff()) with check (is_staff());

-- 학생 본인 select만, 쓰기 정책 없음(진행 갱신은 4-5 finishWorksheet가 service_role로만 한다).
alter table math_track_progress enable row level security;
drop policy if exists "student view own track progress" on math_track_progress;
create policy "student view own track progress" on math_track_progress
  for select using (user_id = auth.uid());
drop policy if exists "staff view track progress" on math_track_progress;
create policy "staff view track progress" on math_track_progress
  for select using (is_staff());

-- profiles.track_id는 authenticated UPDATE 대상에 일부러 안 넣는다(관리자만) — 이전 마이그레이션
-- (signup_hardening)이 REVOKE 후 (name,email,phone,curriculum_group)만 다시 GRANT했으므로,
-- 여기서 track_id를 따로 GRANT하지 않으면 자동으로 학생은 못 고친다(추가 작업 불필요, 확인용).
-- profiles.class_id를 지키던 set_student_class()(supabase/classes.sql)와 같은 이유·같은 패턴으로
-- track_id도 security definer 함수로만 바꾸게 한다. 역할 판정은 새로 만들지 않고 기존 is_admin()
-- (supabase/roles-tier.sql, owner+admin)을 그대로 재사용한다 — set_student_class()도 같은 범위.
create or replace function assign_track(target_user_id uuid, new_track_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  first_worksheet_id uuid;
begin
  if not is_admin() then
    raise exception '과정을 지정할 권한이 없습니다.';
  end if;

  update profiles set track_id = new_track_id where id = target_user_id;

  select worksheet_id into first_worksheet_id
    from math_track_worksheets
    where track_id = new_track_id
    order by position
    limit 1;

  if first_worksheet_id is not null then
    insert into math_track_progress (user_id, worksheet_id, status)
    values (target_user_id, first_worksheet_id, 'open')
    on conflict (user_id, worksheet_id) do update set status = 'open' where math_track_progress.status = 'locked';
  end if;
end;
$fn$;

grant execute on function assign_track(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4-6. v_math_next_action — 사용자당 1행(배정 우선 → 과정의 다음 문제지 → 완료).
-- 같은 이름의 옛 뷰(math-progression PG2, unit 기반)가 있었으나 2.5단계로 /study가 이미
-- 안 읽게 끊어놔서 컬럼 구조가 다른 이 새 정의로 바로 교체한다(옛 정의는
-- supabase/migrations/202609071600_math_progression_views.sql에 원문 남아있음, 복구 필요하면 참고).
-- ---------------------------------------------------------------------
drop view if exists v_math_next_action;

create view v_math_next_action
  with (security_invoker = true) as
with assignment_candidates as (
  select
    vsa.user_id,
    vsa.worksheet_id,
    w.title as worksheet_title,
    vsa.via,
    row_number() over (
      partition by vsa.user_id
      order by (vsa.via = 'class') desc, w.id
    ) as rn
  from v_math_student_assignments vsa
  join worksheets w on w.id = vsa.worksheet_id
  left join math_track_progress mtp on mtp.user_id = vsa.user_id and mtp.worksheet_id = vsa.worksheet_id
  where coalesce(mtp.status, 'locked') != 'passed'
),
track_candidates as (
  select
    p.id as user_id,
    mtw.worksheet_id,
    w.title as worksheet_title,
    row_number() over (partition by p.id order by mtw.position) as rn
  from profiles p
  join math_track_worksheets mtw on mtw.track_id = p.track_id
  join worksheets w on w.id = mtw.worksheet_id
  join math_track_progress mtp on mtp.user_id = p.id and mtp.worksheet_id = mtw.worksheet_id
  where mtp.status = 'open'
)
select
  p.id as user_id,
  case
    when ac.worksheet_id is not null then 'assignment'
    when tc.worksheet_id is not null then 'track'
    else 'done'
  end as action_type,
  coalesce(ac.worksheet_id, tc.worksheet_id) as worksheet_id,
  coalesce(ac.worksheet_title, tc.worksheet_title) as worksheet_title,
  case
    when ac.worksheet_id is not null then '배정된 문제지가 있어요'
    when tc.worksheet_id is not null then '과정의 다음 문제지예요'
    else '모두 완료했어요'
  end as reason_ko
from profiles p
left join assignment_candidates ac on ac.user_id = p.id and ac.rn = 1
left join track_candidates tc on tc.user_id = p.id and tc.rn = 1
where p.role = 'student';

grant select on v_math_next_action to authenticated;
