-- 실전 시험 모드 + 이메일 구독자(리드) + 문제지 발송 스케줄
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- ===== 1) 실전 시험 모드 =====
-- 문제지에 "실전 시험" 여부와 제한시간을 추가한다. 기본은 false(기존 연습용 그대로).
alter table worksheets add column if not exists is_exam boolean not null default false;
alter table worksheets add column if not exists time_limit_minutes integer;

-- 응시 시작 시각을 서버에 기록한다(클라이언트 시계를 믿지 않기 위함).
-- submitted_at 이 채워지면 그 학생은 이 문제지를 다시 응시할 수 없다(1회 응시 강제).
create table if not exists worksheet_attempts (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid references worksheets(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (worksheet_id, user_id)
);

alter table worksheet_attempts enable row level security;

drop policy if exists "students view own attempts" on worksheet_attempts;
create policy "students view own attempts" on worksheet_attempts
  for select using (user_id = auth.uid());

drop policy if exists "admins view all attempts" on worksheet_attempts;
create policy "admins view all attempts" on worksheet_attempts
  for select using (is_admin());

-- insert/update는 서버(service_role, /api/worksheets/[id]/*)에서만 한다 — 클라이언트 직접 쓰기 정책은 두지 않는다.
grant select on worksheet_attempts to authenticated;

-- ===== 2) 이메일 구독자(리드) — 계정 없이 이메일만 등록 =====
create table if not exists mailing_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  subject text not null default 'math', -- 'math' | 'english' 관심 과목
  unsubscribe_token uuid not null default gen_random_uuid(),
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);

alter table mailing_subscribers enable row level security;

-- 공개 구독 폼(로그인 없음)이 새 행을 넣을 수 있어야 한다. 조회·수정은 관리자와 서버(service_role)만.
drop policy if exists "anyone can subscribe" on mailing_subscribers;
create policy "anyone can subscribe" on mailing_subscribers
  for insert with check (true);

drop policy if exists "admins manage subscribers" on mailing_subscribers;
create policy "admins manage subscribers" on mailing_subscribers
  for all using (is_admin()) with check (is_admin());

grant insert on mailing_subscribers to anon, authenticated;
grant select, update, delete on mailing_subscribers to authenticated;

-- ===== 3) 문제지 발송 스케줄 — 관리자가 즉시 대량발송 또는 정기 자동발송을 설정 =====
create table if not exists worksheet_send_schedules (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid references worksheets(id) on delete cascade not null,
  target text not null,              -- 'students' | 'subscribers' | 'both'
  frequency text not null,           -- 'once' | 'weekly' | 'monthly'
  day_of_week int,                   -- weekly용 0(일)~6(토)
  day_of_month int,                  -- monthly용 1~28
  send_hour int not null default 9,  -- 발송 시각(KST 기준 시)
  attach_pdf boolean not null default true,
  active boolean not null default true,
  last_sent_at timestamptz,
  next_run_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table worksheet_send_schedules enable row level security;

drop policy if exists "admins manage schedules" on worksheet_send_schedules;
create policy "admins manage schedules" on worksheet_send_schedules
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on worksheet_send_schedules to authenticated;

create index if not exists worksheet_send_schedules_due_idx
  on worksheet_send_schedules (active, next_run_at);
