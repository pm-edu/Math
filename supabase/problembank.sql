-- 문제은행 1차: 이미지 기반 문제 + 문제지 + 배포
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 1) 문제: 이미지 한 장 + 검색용 태그
--    2차(화면 풀이·자동채점) 대비 칸을 미리 둔다. 1차에서는 image 유형만 쓴다.
create table if not exists problems (
  id uuid primary key default gen_random_uuid(),
  category text not null,              -- '초등' | '중등' | '고등' | 'IB'
  unit text,                           -- 단원 (예: 이차방정식)
  difficulty text default '중',        -- '하' | '중' | '상'
  answer text,                         -- 정답 (예: ③, x=2)
  image_url text not null,             -- 문제 이미지
  solution_image_url text,             -- 해설 이미지 (선택)
  memo text,                           -- 관리자용 메모
  -- ↓ 2차 대비 (지금은 기본값으로 두고 안 씀)
  problem_type text not null default 'image', -- 'image' | 'choice'(객관식) | 'short'(주관식)
  choices text[],                      -- 객관식 보기 (2차에서 사용)
  created_at timestamptz default now()
);

create index if not exists problems_filter_idx on problems (category, unit, difficulty);

-- 2) 문제지: 문제들의 묶음
create table if not exists worksheets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- 3) 문제지에 담긴 문제 (순서 포함)
create table if not exists worksheet_problems (
  worksheet_id uuid references worksheets(id) on delete cascade not null,
  problem_id uuid references problems(id) on delete cascade not null,
  position integer not null default 0,
  primary key (worksheet_id, problem_id)
);

-- 4) 배포: 어떤 문제지를 누구에게
create table if not exists worksheet_assignments (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid references worksheets(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  assigned_at timestamptz default now(),
  unique (worksheet_id, user_id)
);

-- ===== 보안 정책 =====
alter table problems enable row level security;
alter table worksheets enable row level security;
alter table worksheet_problems enable row level security;
alter table worksheet_assignments enable row level security;

-- 문제·문제지·구성: 관리자는 전부 관리. 학생은 "자기에게 배포된" 문제지에 담긴 것만 볼 수 있다.
drop policy if exists "admins manage problems" on problems;
create policy "admins manage problems" on problems
  for all using (is_admin()) with check (is_admin());

-- 학생은 자기에게 배포된 문제지에 포함된 문제만 조회
drop policy if exists "students view assigned problems" on problems;
create policy "students view assigned problems" on problems
  for select using (
    exists (
      select 1
      from worksheet_problems wp
      join worksheet_assignments wa on wa.worksheet_id = wp.worksheet_id
      where wp.problem_id = problems.id
        and wa.user_id = auth.uid()
    )
  );

drop policy if exists "admins manage worksheets" on worksheets;
create policy "admins manage worksheets" on worksheets
  for all using (is_admin()) with check (is_admin());

drop policy if exists "students view assigned worksheets" on worksheets;
create policy "students view assigned worksheets" on worksheets
  for select using (
    exists (
      select 1 from worksheet_assignments wa
      where wa.worksheet_id = worksheets.id and wa.user_id = auth.uid()
    )
  );

drop policy if exists "admins manage worksheet_problems" on worksheet_problems;
create policy "admins manage worksheet_problems" on worksheet_problems
  for all using (is_admin()) with check (is_admin());

drop policy if exists "students view assigned worksheet_problems" on worksheet_problems;
create policy "students view assigned worksheet_problems" on worksheet_problems
  for select using (
    exists (
      select 1 from worksheet_assignments wa
      where wa.worksheet_id = worksheet_problems.worksheet_id and wa.user_id = auth.uid()
    )
  );

drop policy if exists "admins manage assignments" on worksheet_assignments;
create policy "admins manage assignments" on worksheet_assignments
  for all using (is_admin()) with check (is_admin());

drop policy if exists "students view own assignments" on worksheet_assignments;
create policy "students view own assignments" on worksheet_assignments
  for select using (user_id = auth.uid());

grant select, insert, update, delete on problems to authenticated;
grant select, insert, update, delete on worksheets to authenticated;
grant select, insert, update, delete on worksheet_problems to authenticated;
grant select, insert, update, delete on worksheet_assignments to authenticated;

-- 5) 학생 제출·채점 기록 (2차 대비, 지금은 만들어만 두고 안 씀)
--    1차는 종이에 풀고 정답만 확인하는 방식이라 아직 사용하지 않는다.
create table if not exists problem_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  problem_id uuid references problems(id) on delete cascade not null,
  worksheet_id uuid references worksheets(id) on delete set null,
  submitted_answer text,               -- 학생이 낸 답
  is_correct boolean,                  -- 채점 결과
  submitted_at timestamptz default now(),
  unique (user_id, problem_id, worksheet_id)
);

alter table problem_submissions enable row level security;

drop policy if exists "students manage own submissions" on problem_submissions;
create policy "students manage own submissions" on problem_submissions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admins view all submissions" on problem_submissions;
create policy "admins view all submissions" on problem_submissions
  for select using (is_admin());

grant select, insert, update, delete on problem_submissions to authenticated;
