-- 학생 개인의 "과정"(초등/중등/고등/IB 등) 구분 — 관리자 학생관리의 과정별 통계용.
-- 강좌 분류(categories)와 같은 값 집합을 재사용한다(자유 텍스트, categories.name과 동일 값을 씀).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table profiles add column if not exists grade_level text;

-- class_id 와 같은 이유로 직접 update 대신 이 함수로만 바꾼다
-- (profiles는 authenticated에게 name, email 컬럼만 update 권한이 열려 있음 — roles-tier.sql 참고).
create or replace function set_student_grade_level(target_id uuid, new_grade_level text)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  my_role text;
begin
  select role into my_role from profiles where id = auth.uid();
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception '과정을 지정할 권한이 없습니다.';
  end if;
  update profiles set grade_level = new_grade_level where id = target_id;
end;
$fn$;

grant execute on function set_student_grade_level(uuid, text) to authenticated;
