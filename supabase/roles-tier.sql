-- 권한 5단계로 확장: owner / admin / teacher / assistant / student
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.

-- 1) role 값 제약을 5단계로 넓힌다 (기존엔 student/admin 만 허용).
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner', 'admin', 'teacher', 'assistant', 'student'));

-- 2) 기존 관리자(=사장님)를 최종관리자(owner)로 올린다. (한 번만 의미 있음)
--    이후에는 화면의 "권한 관리"에서 서로 역할을 지정한다.
update profiles set role = 'owner' where role = 'admin';

-- 3) 판별 함수.
--    is_admin(): 사이트 운영 권한 = owner + admin
--    is_staff(): 관리 계층 전체 = owner + admin + teacher + assistant
create or replace function is_admin()
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('owner', 'admin')
  );
$fn$;

create or replace function is_staff()
returns boolean language sql security definer set search_path = public stable as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('owner', 'admin', 'teacher', 'assistant')
  );
$fn$;

-- 4) 자료(문제 · 문제지 · 배포)와 제출 기록은 "직원 전원"이 다루도록 정책 교체.
drop policy if exists "admins manage problems" on problems;
create policy "staff manage problems" on problems
  for all using (is_staff()) with check (is_staff());

drop policy if exists "admins manage worksheets" on worksheets;
create policy "staff manage worksheets" on worksheets
  for all using (is_staff()) with check (is_staff());

drop policy if exists "admins manage worksheet_problems" on worksheet_problems;
create policy "staff manage worksheet_problems" on worksheet_problems
  for all using (is_staff()) with check (is_staff());

drop policy if exists "admins manage assignments" on worksheet_assignments;
create policy "staff manage assignments" on worksheet_assignments
  for all using (is_staff()) with check (is_staff());

-- 성적 · 제출현황 열람: 직원 전원 (조교 포함)
drop policy if exists "admins view all submissions" on problem_submissions;
create policy "staff view all submissions" on problem_submissions
  for select using (is_staff());

-- 문제 이미지 업로드/수정/삭제도 직원 전원.
drop policy if exists "admins upload problem images" on storage.objects;
create policy "staff upload problem images" on storage.objects
  for insert to authenticated with check (bucket_id = 'problems' and is_staff());

drop policy if exists "admins update problem images" on storage.objects;
create policy "staff update problem images" on storage.objects
  for update to authenticated using (bucket_id = 'problems' and is_staff());

drop policy if exists "admins delete problem images" on storage.objects;
create policy "staff delete problem images" on storage.objects
  for delete to authenticated using (bucket_id = 'problems' and is_staff());

-- 5) 직원은 학생 명단(프로필)을 열람할 수 있어야 성적/배포 대상을 다룰 수 있다.
drop policy if exists "admins can view all profiles" on profiles;
create policy "staff can view all profiles" on profiles
  for select using (is_staff());

-- 6) 역할 변경은 아무나 못 하게 막는다.
--    role 컬럼 자체를 일반 사용자가 직접 수정하지 못하도록 컬럼 권한을 좁힌다.
--    (이러면 학생이 자기 role 을 admin 으로 바꾸는 것도 원천 차단된다.)
revoke update on profiles from authenticated;
grant update (name, email) on profiles to authenticated;

-- 역할 부여는 이 함수로만. security definer 라 컬럼 제한을 우회해서 role 을 바꾼다.
create or replace function set_user_role(target_id uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  my_role text;
  target_role text;
begin
  select role into my_role from profiles where id = auth.uid();
  select role into target_role from profiles where id = target_id;

  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception '역할을 바꿀 권한이 없습니다.';
  end if;
  if new_role not in ('owner', 'admin', 'teacher', 'assistant', 'student') then
    raise exception '잘못된 역할입니다.';
  end if;

  -- 관리자(admin)는 상위 계층을 만들거나 건드릴 수 없다. 최종관리자(owner)만 가능.
  if my_role = 'admin' then
    if new_role in ('owner', 'admin') then
      raise exception '관리자는 최종관리자/관리자 역할을 부여할 수 없습니다.';
    end if;
    if target_role in ('owner', 'admin') then
      raise exception '관리자는 상위 관리자의 역할을 바꿀 수 없습니다.';
    end if;
  end if;

  -- 마지막 남은 최종관리자를 강등하지 못하게 한다.
  if target_role = 'owner' and new_role <> 'owner'
     and (select count(*) from profiles where role = 'owner') <= 1 then
    raise exception '최소 1명의 최종관리자가 필요합니다.';
  end if;

  update profiles set role = new_role where id = target_id;
end;
$fn$;

grant execute on function set_user_role(uuid, text) to authenticated;

-- 실행 후 확인용
select id, name, email, role from profiles order by created_at;
