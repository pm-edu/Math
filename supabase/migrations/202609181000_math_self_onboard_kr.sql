-- 2026-09-18: math.pmedu4u.com 학생이 과정을 직접 고르는 화면조차 없애고, curriculum_group이
-- 없는 학생은 로그인 즉시 "한국 교육과정 + KR 기본" 과정으로 자동 배정한다(사용자 지시:
-- "한국수학에 집중" + "과목배정은 웹사이트 내에서" — 관리자 수동 배정/카톡·왓츠앱 연락 없이
-- 웹사이트 안에서 바로 끝나야 함). assign_track()과 똑같은 배정 로직이지만 그건 is_admin()
-- 체크가 있어 학생 본인은 못 쓴다 — 그 함수를 고치는 대신 범위를 훨씬 좁힌 함수를 새로 만든다:
-- auth.uid()로만 동작(본인 외엔 절대 건드릴 수 없음), curriculum_group/track_id가 둘 다
-- 비어있을 때만 1회 동작(이미 배정된 학생이 실수로/악의적으로 재호출해도 아무 일 없음).
create or replace function self_onboard_kr_track()
returns void language plpgsql security definer set search_path = public as $fn$
declare
  kr_track_id uuid;
  first_worksheet_id uuid;
begin
  update profiles
    set curriculum_group = 'KR'
    where id = auth.uid() and curriculum_group is null and track_id is null;

  if not found then
    return; -- 이미 배정됐거나(재호출) 다른 커리큘럼을 이미 고른 학생 — 아무것도 안 함
  end if;

  select id into kr_track_id from math_tracks where name = 'KR 기본' and is_active limit 1;
  if kr_track_id is null then
    return; -- KR 기본 트랙이 없는 비정상 상태 — curriculum_group만 채워지고 배정은 admin이
  end if;

  update profiles set track_id = kr_track_id where id = auth.uid();

  select worksheet_id into first_worksheet_id
    from math_track_worksheets
    where track_id = kr_track_id
    order by position
    limit 1;

  if first_worksheet_id is not null then
    insert into math_track_progress (user_id, worksheet_id, status)
    values (auth.uid(), first_worksheet_id, 'open')
    on conflict (user_id, worksheet_id) do update set status = 'open' where math_track_progress.status = 'locked';
  end if;
end;
$fn$;

grant execute on function self_onboard_kr_track() to authenticated;
