-- 수학 학습 진행 구조 PG5 사소한 수정: v_math_next_action의 item_count가 복습 추천에도
-- 항상 8(연습 세션 기본값)로 나오던 것을 고친다 — PG5에서 복습 세션은 4문항으로 확정됨
-- (src/lib/math/server/session.ts REVIEW_ITEM_COUNT). 아직 세션을 시작하기 전(추천 단계)엔
-- math_sessions 행이 없어 실제 item_count를 모르므로, session_kind에 따른 기본값만 바꾼다.
-- 이 필드는 지금 화면에서 실제로 쓰이진 않지만(대시보드는 unit_name/reason_ko만 표시),
-- API 계약을 정확하게 맞춰둔다.
--
-- security_invoker=true 유지 필수([[feedback-view-security-invoker]] 참고) — CREATE OR
-- REPLACE로 본문만 바꾸면 기존에 걸어둔 옵션은 그대로 유지된다(PG1 뷰 파일과 동일 본문,
-- item_count 계산식 한 줄만 다르다).

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
  coalesce(a.item_count, case when dr.unit_id is not null then 4 else 8 end) as item_count,
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

alter view v_math_next_action set (security_invoker = true);
