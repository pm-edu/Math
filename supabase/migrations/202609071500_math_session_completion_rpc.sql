-- 수학 학습 진행 구조 PG1: 세션 완료 반영 트랜잭션 (RUN_MATH_PROGRESSION.md PG1 1-2)
--
-- completeSession()은 math_sessions/math_unit_states/math_daily_activity 세 테이블을
-- "트랜잭션으로 묶는다"는 지시가 있다. 숙달 판정 자체(judgeMastery/decideNextStep)는 단위
-- 테스트 대상인 순수 TS 함수로 두고(src/lib/math/progression.ts), 그 결과를 반영하는 쓰기만
-- 이 함수 하나로 묶어 원자성을 보장한다 — plpgsql 함수 본문은 그 자체로 하나의 트랜잭션이다.
--
-- service role 전용 — 학생이 직접 이 RPC를 호출해 진행 상태를 조작할 수 없도록 public 실행
-- 권한을 회수한다(신규 함수는 기본적으로 PUBLIC에 EXECUTE 권한이 열려 있다).
create or replace function math_apply_session_completion(
  p_session_id bigint,
  p_user_id uuid,
  p_unit_id uuid,
  p_status text,
  p_mastery_score numeric,
  p_first_try_accuracy numeric,
  p_items_attempted int,
  p_consecutive_failed_sessions int,
  p_activity_date date,
  p_item_count int
) returns void language plpgsql as $fn$
begin
  update math_sessions
    set status = 'completed', completed_at = now()
    where id = p_session_id and user_id = p_user_id and status = 'in_progress';

  if not found then
    raise exception 'math_sessions: id=% 이 user=%의 진행중 세션이 아닙니다', p_session_id, p_user_id;
  end if;

  insert into math_unit_states (
    user_id, unit_id, status, mastery_score, first_try_accuracy,
    items_attempted, consecutive_failed_sessions, last_practiced_at, updated_at
  ) values (
    p_user_id, p_unit_id, p_status, p_mastery_score, p_first_try_accuracy,
    p_items_attempted, p_consecutive_failed_sessions, now(), now()
  )
  on conflict (user_id, unit_id) do update set
    status = excluded.status,
    mastery_score = excluded.mastery_score,
    first_try_accuracy = excluded.first_try_accuracy,
    items_attempted = excluded.items_attempted,
    consecutive_failed_sessions = excluded.consecutive_failed_sessions,
    last_practiced_at = excluded.last_practiced_at,
    updated_at = excluded.updated_at;

  insert into math_daily_activity (user_id, date, sessions_done, items_done)
  values (p_user_id, p_activity_date, 1, p_item_count)
  on conflict (user_id, date) do update set
    sessions_done = math_daily_activity.sessions_done + 1,
    items_done = math_daily_activity.items_done + excluded.items_done;
end;
$fn$;

revoke execute on function math_apply_session_completion(
  bigint, uuid, uuid, text, numeric, numeric, int, int, date, int
) from public;
grant execute on function math_apply_session_completion(
  bigint, uuid, uuid, text, numeric, numeric, int, int, date, int
) to service_role;
