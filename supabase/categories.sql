-- 강좌 분류를 관리자가 화면에서 등록·삭제할 수 있게 DB로 옮긴다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,          -- 분류 이름 (예: 초등, 중등, 고등, IB, 성인)
  name_en text,                       -- 영어 화면용 (예: Elementary)
  position integer not null default 0, -- 표시 순서
  created_at timestamptz default now()
);

alter table categories enable row level security;

-- 분류는 누구나 볼 수 있고(강좌 목록에 필요), 등록·수정·삭제는 관리자만.
drop policy if exists "categories viewable by everyone" on categories;
create policy "categories viewable by everyone" on categories
  for select using (true);

drop policy if exists "admins manage categories" on categories;
create policy "admins manage categories" on categories
  for all using (is_admin()) with check (is_admin());

grant select on categories to anon, authenticated;
grant insert, update, delete on categories to authenticated;

-- 지금 코드에 고정돼 있던 4개를 기본값으로 넣는다.
insert into categories (name, name_en, position) values
  ('초등', 'Elementary', 1),
  ('중등', 'Middle School', 2),
  ('고등', 'High School', 3),
  ('IB', 'IB', 4)
on conflict (name) do nothing;
