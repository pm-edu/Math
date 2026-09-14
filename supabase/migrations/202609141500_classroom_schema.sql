-- 실시간 화상 강의실(LiveKit) + 판서(Excalidraw)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- is_admin()/is_staff()는 supabase/roles-tier.sql에서 이미 정의됨(전제조건).

create table if not exists classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  teacher_id uuid references auth.users(id) not null,
  -- LiveKit room 이름 — 강의실 하나당 고유. worksheets.id 같은 uuid를 그대로 문자열로 씀.
  livekit_room text not null unique default gen_random_uuid()::text,
  status text not null default 'scheduled', -- 'scheduled' | 'live' | 'ended'
  -- Excalidraw scene(도형·선 등) 마지막 저장본 — 새로고침·재입장 시 복구용.
  -- 실시간 동안은 Supabase Realtime Broadcast로 주고받고, 이 컬럼은 스냅샷만 둔다.
  whiteboard_data jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists classroom_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references classroom_sessions(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'student', -- 'teacher' | 'student'
  joined_at timestamptz,
  left_at timestamptz,
  unique (session_id, user_id)
);

-- 두 테이블을 먼저 다 만든 뒤에 정책을 건다 — classroom_sessions의 정책 하나가
-- classroom_participants를 참조하는데, 테이블이 아직 없을 때 정책부터 만들면
-- "relation classroom_participants does not exist" 에러로 이 아래 전부가 중단된다
-- (2026-09-14 실행 중 발견 — 순서 실수).

alter table classroom_sessions enable row level security;

drop policy if exists "staff manage classroom sessions" on classroom_sessions;
create policy "staff manage classroom sessions" on classroom_sessions
  for all using (is_staff()) with check (is_staff());

-- 학생은 자신이 참가자로 배정된 강의실만 조회(worksheet_assignments와 같은 원칙 — 관리자가 미리 배정).
drop policy if exists "students view assigned classroom sessions" on classroom_sessions;
create policy "students view assigned classroom sessions" on classroom_sessions
  for select using (
    exists (
      select 1 from classroom_participants cp
      where cp.session_id = classroom_sessions.id and cp.user_id = auth.uid()
    )
  );

alter table classroom_participants enable row level security;

drop policy if exists "staff manage classroom participants" on classroom_participants;
create policy "staff manage classroom participants" on classroom_participants
  for all using (is_staff()) with check (is_staff());

drop policy if exists "students view own participation" on classroom_participants;
create policy "students view own participation" on classroom_participants
  for select using (user_id = auth.uid());

-- 학생이 직접 만들 수 있는 건 "내가 지금 입장/퇴장했다"는 시각 기록뿐(배정 자체는 staff만).
drop policy if exists "students update own join time" on classroom_participants;
create policy "students update own join time" on classroom_participants
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on classroom_sessions to authenticated;
grant select, insert, update on classroom_participants to authenticated;

create index if not exists classroom_participants_session_idx on classroom_participants(session_id);
create index if not exists classroom_participants_user_idx on classroom_participants(user_id);
