-- RUN_MATH_SITE.md 6단계 마무리(2) — "정답 의심 문항"(학생이 계속 틀리는데 아무도 확인 안 한 문항)
-- 뷰. 5회 이상 첫 시도(attempt_no=1, source='self') 중 정답률 20% 이하만 잡는다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create or replace view v_math_problem_suspects
  with (security_invoker = true) as
with first_tries as (
  select problem_id,
    count(*) as attempt_count,
    round(avg(case when is_correct then 1.0 else 0.0 end), 3) as accuracy
  from question_attempts
  where attempt_no = 1 and source = 'self'
  group by problem_id
  having count(*) >= 5 and avg(case when is_correct then 1.0 else 0.0 end) <= 0.2
)
select
  p.id as problem_id,
  cu.unit_name,
  p.curriculum_group,
  p.curriculum_detail,
  p.unit,
  string_agg(distinct w.title, ', ') as worksheet_title,
  ft.attempt_count,
  ft.accuracy
from first_tries ft
join problems p on p.id = ft.problem_id
left join curriculum_units cu on cu.id = p.unit_id
left join worksheet_problems wp on wp.problem_id = p.id
left join worksheets w on w.id = wp.worksheet_id
group by p.id, cu.unit_name, p.curriculum_group, p.curriculum_detail, p.unit, ft.attempt_count, ft.accuracy;

grant select on v_math_problem_suspects to authenticated;
