-- 반(class): 학생을 교사에게 묶어 리포트 범위를 잡기 위한 사이트 공통 그룹.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다(additive, 기존 데이터 안 건드림).

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  teacher_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table profiles add column if not exists class_id uuid references classes(id) on delete set null;

alter table classes enable row level security;

-- 직원 전원 조회 가능(교사가 자기 반인지 판단하려면 전체 목록이 보여야 함 — 화면에서 필터링).
drop policy if exists "staff can view classes" on classes;
create policy "staff can view classes" on classes
  for select using (is_staff());

-- 반 생성 · 이름변경 · 교사배정 · 삭제는 사이트 운영자(최종관리자+관리자)만.
drop policy if exists "admins manage classes" on classes;
create policy "admins manage classes" on classes
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on classes to authenticated;

-- 학생의 반 배정은 role 변경과 같은 방식으로 막는다: 컬럼을 직접 못 고치게 하고
-- security definer 함수로만 바꾸게 한다(학생이 자기 class_id를 셀프 배정 못 하도록).
create or replace function set_student_class(target_id uuid, new_class_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  my_role text;
begin
  select role into my_role from profiles where id = auth.uid();
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception '반을 배정할 권한이 없습니다.';
  end if;
  update profiles set class_id = new_class_id where id = target_id;
end;
$fn$;

grant execute on function set_student_class(uuid, uuid) to authenticated;

-- 실행 후 확인용
select id, name, teacher_id, created_at from classes order by created_at;
