-- 학생/관리자 권한 구조
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- auth.users 는 앱에서 직접 조회할 수 없으므로, 조회 가능한 프로필 테이블을 둔다.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'student' check (role in ('student', 'admin')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- 관리자 판별.
-- RLS 정책 안에서 profiles 를 다시 읽으면 무한 재귀가 나므로,
-- security definer 함수로 RLS 를 우회해서 확인한다.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$fn$;

drop policy if exists "users can view own profile" on profiles;
create policy "users can view own profile" on profiles
  for select using (auth.uid() = id);

drop policy if exists "admins can view all profiles" on profiles;
create policy "admins can view all profiles" on profiles
  for select using (is_admin());

drop policy if exists "users can update own profile" on profiles;
create policy "users can update own profile" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 관리자는 전체 구매 내역과 문의를 볼 수 있다.
drop policy if exists "admins can view all purchases" on purchases;
create policy "admins can view all purchases" on purchases
  for select using (is_admin());

drop policy if exists "admins can view all contacts" on contacts;
create policy "admins can view all contacts" on contacts
  for select using (is_admin());

-- 가입하면 프로필이 자동으로 생긴다.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into profiles (id, name, email)
  values (new.id, new.raw_user_meta_data->>'name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 이미 가입한 사용자들의 프로필을 채운다.
insert into profiles (id, name, email)
select id, raw_user_meta_data->>'name', email from auth.users
on conflict (id) do nothing;

grant select, update on profiles to authenticated;

-- 실행 후 가입자 목록 확인용
select id, name, email, role from profiles order by created_at;
