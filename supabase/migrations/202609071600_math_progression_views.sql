-- 수학 학습 진행 구조 PG1: 뷰 6종 (RUN_MATH_PROGRESSION.md PG1 1-3)
-- 모든 집계는 여기(View)에서 한다 — 앱 코드에서 계산 금지(지시서 전역 금지사항).
--
-- 지시서 범위를 넘는 보강 1건: v_math_unit_progress의 "source='lesson' 제외"는 원문 그대로
-- 두되, session_id로 math_sessions와 조인해 kind='diagnostic'도 같이 제외했다. PG4에서
-- "진단 시도는 능력 통계에서 제외"라고 미리 정해뒀고, session.ts가 이미 diagnostic 세션도
-- source='self'로 기록하므로(구분 안 함) 지금 넣어두지 않으면 PG4에서 이 뷰를 다시 고쳐야 한다.

-- ---------------------------------------------------------------------
-- v_math_weakness: 약점 순위 = (100 − 정답률) × ln(시도수 + 1)
-- ---------------------------------------------------------------------
create or replace view v_math_weakness as
select
  qa.student_id as user_id,
  qa.unit_id,
  count(*) as attempts,
  avg(case when qa.is_correct then 100.0 else 0 end) as accuracy_pct,
  (100 - avg(case when qa.is_correct then 100.0 else 0 end)) * ln(count(*) + 1) as weakness_score
from question_attempts qa
left join math_sessions ms on ms.id = qa.session_id
where qa.source = 'self'
  and qa.attempt_no = 1
  and qa.unit_id is not null
  and (ms.kind is null or ms.kind <> 'diagnostic')
group by qa.student_id, qa.unit_id;

-- ---------------------------------------------------------------------
-- v_math_unit_progress: unit별 상태 + 첫시도 정답률 (source='lesson', kind='diagnostic' 제외)
-- ---------------------------------------------------------------------
create or replace view v_math_unit_progress as
select
  mus.user_id,
  mus.unit_id,
  cu.unit_name,
  cu.curriculum_group,
  cu.curriculum_detail,
  mus.status,
  mus.mastery_score,
  fta.first_try_accuracy,
  coalesce(fta.attempts, 0) as first_try_attempts,
  mus.items_attempted,
  mus.consecutive_failed_sessions,
  mus.last_practiced_at,
  mus.next_review_at
from math_unit_states mus
join curriculum_units cu on cu.id = mus.unit_id
left join (
  select
    qa.student_id as user_id,
    qa.unit_id,
    avg(case when qa.is_correct then 1.0 else 0 end) as first_try_accuracy,
    count(*) as attempts
  from question_attempts qa
  left join math_sessions ms on ms.id = qa.session_id
  where qa.source = 'self' and qa.attempt_no = 1 and (ms.kind is null or ms.kind <> 'diagnostic')
  group by qa.student_id, qa.unit_id
) fta on fta.user_id = mus.user_id and fta.unit_id = mus.unit_id;

-- ---------------------------------------------------------------------
-- v_math_review_queue: next_review_at 도래분
-- ---------------------------------------------------------------------
create or replace view v_math_review_queue as
select mus.user_id, mus.unit_id, cu.unit_name, mus.next_review_at, mus.mastery_score
from math_unit_states mus
join curriculum_units cu on cu.id = mus.unit_id
where mus.status = 'mastered' and mus.next_review_at is not null and mus.next_review_at < now();

-- ---------------------------------------------------------------------
-- v_math_streak: 연속 학습일(오늘 또는 어제까지 이어진 것만 "현재" 스트릭으로 침)
-- ---------------------------------------------------------------------
create or replace view v_math_streak as
with daily as (
  select user_id, date, row_number() over (partition by user_id order by date desc) as rn
  from math_daily_activity
  where sessions_done > 0
),
grp as (
  select user_id, date, rn, date - (rn || ' days')::interval as grp_key
  from daily
),
streaks as (
  select user_id, grp_key, count(*) as streak_len, max(date) as streak_end
  from grp
  group by user_id, grp_key
)
select distinct on (user_id)
  user_id,
  streak_len as current_streak_days,
  streak_end as last_active_date
from streaks
where streak_end >= (current_date - interval '1 day')
order by user_id, streak_end desc, streak_len desc;

-- ---------------------------------------------------------------------
-- v_math_stuck_students: 관리자용 — consecutive_failed_sessions >= 3
-- ---------------------------------------------------------------------
create or replace view v_math_stuck_students as
select
  mus.user_id,
  p.name,
  p.email,
  mus.unit_id,
  cu.unit_name,
  mus.consecutive_failed_sessions,
  mus.last_practiced_at
from math_unit_states mus
join curriculum_units cu on cu.id = mus.unit_id
join profiles p on p.id = mus.user_id
where mus.consecutive_failed_sessions >= 3;

-- ---------------------------------------------------------------------
-- v_math_next_action: 사용자당 정확히 1행. 우선순위:
--   1) 진행중 미완료 세션  2) next_review_at 도래한 mastered unit(복습)
--   3) in_progress unit    4) 커리큘럼 순서상 가장 앞의 available(잠금 해제된) unit
--   5) v_math_weakness 최상위                              6) 그마저 없으면 'done'
--
-- "available"은 별도로 저장되는 상태가 아니다 — math_unit_states에 행이 아예 없거나
-- mastered가 아니면서, 직접 선수(math_unit_prereqs)가 전부 mastered인 unit을 그때그때
-- 계산한다(잠금 해제 로직을 별도 함수로 안 만들고 이 뷰 안에서만 판정 — 지시서 1-3 범위).
--
-- 지금은 D-PG-1(1차 커리큘럼 IGCSE_0607)만 지원한다 — math_placements로 커리큘럼을 고르는
-- 기능은 PG4(온보딩)에서 생긴다. 그때 이 CTE의 curriculum_detail 조건을 placements 조인으로
-- 바꿔야 한다.
-- ---------------------------------------------------------------------
create or replace view v_math_next_action as
with students as (
  select id as user_id from profiles where role = 'student'
),
active_session as (
  select user_id, id as session_id, unit_id, kind, item_count
  from math_sessions
  where status = 'in_progress'
),
due_review as (
  select distinct on (user_id) user_id, unit_id
  from math_unit_states
  where status = 'mastered' and next_review_at is not null and next_review_at < now()
  order by user_id, next_review_at asc
),
in_progress_unit as (
  select distinct on (user_id) user_id, unit_id
  from math_unit_states
  where status = 'in_progress'
  order by user_id, last_practiced_at desc nulls last
),
available_unit as (
  select distinct on (s.user_id) s.user_id as user_id, cu.id as unit_id
  from students s
  cross join curriculum_units cu
  where cu.curriculum_detail = 'IGCSE_0607'
    and cu.unit_name not ilike '%코스워크%'
    and not exists (
      select 1 from math_unit_states mus
      where mus.user_id = s.user_id and mus.unit_id = cu.id and mus.status = 'mastered'
    )
    and not exists (
      select 1 from math_unit_prereqs pr
      where pr.unit_id = cu.id
        and not exists (
          select 1 from math_unit_states mus2
          where mus2.user_id = s.user_id and mus2.unit_id = pr.requires_unit_id and mus2.status = 'mastered'
        )
    )
  order by s.user_id, cu.sort_order asc
),
weakest_unit as (
  select distinct on (user_id) user_id, unit_id from v_math_weakness order by user_id, weakness_score desc
)
select
  s.user_id,
  case
    when a.session_id is not null then 'resume_session'
    when dr.unit_id is not null then 'review'
    when ip.unit_id is not null then 'practice'
    when av.unit_id is not null then 'practice'
    when w.unit_id is not null then 'practice'
    else 'done'
  end as action_type,
  coalesce(a.unit_id, dr.unit_id, ip.unit_id, av.unit_id, w.unit_id) as unit_id,
  cu.unit_name,
  coalesce(a.kind, case when dr.unit_id is not null then 'review' else 'practice' end) as session_kind,
  coalesce(a.item_count, 8) as item_count,
  case
    when a.session_id is not null then '이어서 풀기'
    when dr.unit_id is not null then '복습할 때가 됐어요'
    when ip.unit_id is not null then '진행 중인 단원이에요'
    when av.unit_id is not null then '다음 단원으로 넘어가요'
    when w.unit_id is not null then '약점을 보완해요'
    else '모든 단원을 마쳤어요'
  end as reason_ko
from students s
left join active_session a on a.user_id = s.user_id
left join due_review dr on dr.user_id = s.user_id
left join in_progress_unit ip on ip.user_id = s.user_id
left join available_unit av on av.user_id = s.user_id
left join weakest_unit w on w.user_id = s.user_id
left join curriculum_units cu on cu.id = coalesce(a.unit_id, dr.unit_id, ip.unit_id, av.unit_id, w.unit_id);
