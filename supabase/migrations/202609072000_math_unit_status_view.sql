-- 수학 학습 진행 구조 PG6: 커리큘럼 맵용 뷰 (RUN_MATH_PROGRESSION.md PG6 6-1)
--
-- /study/path(커리큘럼 맵)는 unit마다 잠김/해금/진행중/숙달 색상을 구분해야 하는데,
-- math_unit_states는 학생이 실제로 손댄(in_progress/mastered) unit만 행을 갖는다 —
-- 아직 시작 안 한 unit이 "잠김"인지 "해금됐지만 안 함"인지는 v_math_next_action의
-- available_unit CTE 로직(직접 선수관계가 전부 mastered인지)을 그대로 재사용해야 알 수
-- 있다. 그 판정을 이 뷰로 한 번 더 뽑아서 "전체 unit 목록 + 내 상태"를 한 번에 준다.
--
-- security_invoker=true 필수([[feedback-view-security-invoker]]) — 학생 계정으로 조회하면
-- profiles RLS(본인 행만) 때문에 자동으로 자기 자신의 unit 상태만 나온다.

create or replace view v_math_unit_status with (security_invoker = true) as
select
  s.user_id,
  cu.id as unit_id,
  cu.unit_name,
  cu.sort_order,
  coalesce(
    mus.status,
    case
      when not exists (
        select 1 from math_unit_prereqs pr
        where pr.unit_id = cu.id
          and not exists (
            select 1 from math_unit_states mus2
            where mus2.user_id = s.user_id and mus2.unit_id = pr.requires_unit_id and mus2.status = 'mastered'
          )
      ) then 'available'
      else 'locked'
    end
  ) as status
from (select id as user_id from profiles where role = 'student') s
cross join curriculum_units cu
left join math_unit_states mus on mus.user_id = s.user_id and mus.unit_id = cu.id
where cu.curriculum_detail = 'IGCSE_0607' -- D-PG-1, v_math_next_action과 동일한 제약
  and cu.unit_name not ilike '%코스워크%';
