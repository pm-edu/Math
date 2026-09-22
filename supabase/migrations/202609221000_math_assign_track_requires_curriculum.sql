-- 2026-09-22: assign_track()에 가드 추가.
-- 규칙 재확인(사용자): "학생이 선택을 하고 관리자가 배정을 해줘야 한다" — 학생이 아직
-- curriculum_group(과정)을 스스로 고르지 않았는데 관리자가 트랙을 배정하면, src/app/study/page.tsx가
-- curriculum_group부터 확인하는 구조상 트랙이 배정돼도 학생 화면엔 반영이 안 되는(조용히 무효화되는)
-- 버그를 실사용 중 발견했다(/admin/study/students에서 실제로 재현). UI(체크박스 비활성화)뿐 아니라
-- 함수 자체에도 가드를 걸어 다른 경로로 호출돼도 항상 지켜지게 한다.
create or replace function assign_track(target_user_id uuid, new_track_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare
  first_worksheet_id uuid;
begin
  if not is_admin() then
    raise exception '과정을 지정할 권한이 없습니다.';
  end if;

  if not exists (select 1 from profiles where id = target_user_id and curriculum_group is not null) then
    raise exception '학생이 먼저 과정(커리큘럼)을 선택해야 배정할 수 있습니다.';
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
