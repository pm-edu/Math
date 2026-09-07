-- 수학 학습 진행 구조 PG5: 복습 세션 완료 반영 트랜잭션 (RUN_MATH_PROGRESSION.md PG5 5-1)
--
-- PG1의 math_apply_session_completion과 같은 이유로 하나의 함수에 묶는다 — 복습은 판정 규칙
-- 자체가 practice/diagnostic(judgeMastery/decideNextStep)과 다르므로 별도 함수로 분리했다.
-- 복습 대상 unit은 이미 mastered 상태였던 unit뿐이라(v_math_review_queue 정의), 여기서는
-- math_unit_states upsert가 아니라 update만 한다 — 없는 unit을 복습하는 경우는 없다.
--
-- service role 전용 — 학생이 직접 호출해 자기 FSRS 상태를 조작할 수 없도록 public 실행
-- 권한을 회수한다.
create or replace function math_apply_review_completion(
  p_session_id bigint,
  p_user_id uuid,
  p_unit_id uuid,
  p_status text,
  p_fsrs_stability real,
  p_fsrs_difficulty real,
  p_fsrs_reps int,
  p_fsrs_lapses int,
  p_next_review_at timestamptz,
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

  update math_unit_states set
    status = p_status,
    fsrs_stability = p_fsrs_stability,
    fsrs_difficulty = p_fsrs_difficulty,
    fsrs_reps = p_fsrs_reps,
    fsrs_lapses = p_fsrs_lapses,
    next_review_at = p_next_review_at,
    last_practiced_at = now(),
    updated_at = now()
  where user_id = p_user_id and unit_id = p_unit_id;

  insert into math_daily_activity (user_id, date, sessions_done, items_done)
  values (p_user_id, p_activity_date, 1, p_item_count)
  on conflict (user_id, date) do update set
    sessions_done = math_daily_activity.sessions_done + 1,
    items_done = math_daily_activity.items_done + excluded.items_done;
end;
$fn$;

revoke execute on function math_apply_review_completion(
  bigint, uuid, uuid, text, real, real, int, int, timestamptz, date, int
) from public;
grant execute on function math_apply_review_completion(
  bigint, uuid, uuid, text, real, real, int, int, timestamptz, date, int
) to service_role;
