-- 학생관리 P4: 통계 View. docs/student-management.md §3 공식을 그대로 구현.
-- security_invoker=true로 만들어서, 보는 사람의 RLS를 그대로 따른다
--   (직원이 보면 전체 학생, 학생 본인이 보면 자기 데이터만 — 별도 "공개용 뷰"를 안 만들어도 됨).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

-- ---------------------------------------------------------------------
-- v_student_core — 학생 목록·상세 공용, 학생당 1행
-- ---------------------------------------------------------------------
create or replace view v_student_core with (security_invoker = true) as
with attendance_agg as (
  select student_id,
    count(*) as scheduled,
    count(*) filter (where status in ('present', 'late')) as attended
  from attendance
  group by student_id
),
worksheet_agg as (
  select wa.user_id as student_id,
    count(distinct wa.worksheet_id) as assigned,
    count(distinct ps.worksheet_id) as submitted
  from worksheet_assignments wa
  left join problem_submissions ps
    on ps.worksheet_id = wa.worksheet_id and ps.user_id = wa.user_id
  group by wa.user_id
),
first_try_agg as (
  select student_id,
    count(*) filter (where attempt_no = 1) as attempts,
    count(*) filter (where attempt_no = 1 and is_correct) as correct
  from question_attempts
  group by student_id
),
recent_agg as (
  select student_id, count(*) as attempts, count(*) filter (where is_correct) as correct
  from question_attempts
  where created_at >= now() - interval '28 days'
  group by student_id
),
prior_agg as (
  select student_id, count(*) as attempts, count(*) filter (where is_correct) as correct
  from question_attempts
  where created_at >= now() - interval '56 days' and created_at < now() - interval '28 days'
  group by student_id
),
last_active_agg as (
  select student_id, max(created_at) as last_at from question_attempts group by student_id
),
rates as (
  select
    p.id as student_id,
    p.name,
    p.email,
    case when a.scheduled > 0 then round(100.0 * a.attended / a.scheduled, 1) end as attendance_rate,
    case when w.assigned > 0 then round(100.0 * w.submitted / w.assigned, 1) end as submission_rate,
    case when f.attempts > 0 then round(100.0 * f.correct / f.attempts, 1) end as first_try_accuracy,
    case when r.attempts > 0 then 100.0 * r.correct / r.attempts end as recent_accuracy,
    case when pr.attempts > 0 then 100.0 * pr.correct / pr.attempts end as prior_accuracy,
    la.last_at as last_active_at
  from profiles p
  left join attendance_agg a on a.student_id = p.id
  left join worksheet_agg w on w.student_id = p.id
  left join first_try_agg f on f.student_id = p.id
  left join recent_agg r on r.student_id = p.id
  left join prior_agg pr on pr.student_id = p.id
  left join last_active_agg la on la.student_id = p.id
  where p.role = 'student'
)
select
  student_id, name, email, attendance_rate, submission_rate, first_try_accuracy,
  case when recent_accuracy is not null and prior_accuracy is not null
    then round(recent_accuracy - prior_accuracy, 1) end as growth_delta,
  least(100, greatest(0, round(
      25 * least(1, greatest(0, (85 - coalesce(attendance_rate, 100)) / 85.0))
    + 25 * least(1, greatest(0, (80 - coalesce(submission_rate, 100)) / 80.0))
    + 25 * (case when recent_accuracy is not null and prior_accuracy is not null
                  and recent_accuracy - prior_accuracy < 0 then 1 else 0 end)
    + 25 * (case when last_active_at is null or last_active_at < now() - interval '14 days' then 1 else 0 end)
  ))) as risk_score
from rates;

-- ---------------------------------------------------------------------
-- v_student_units — 단원별 정답률·시도수·오답수 (레이더·취약 Top5용)
-- ---------------------------------------------------------------------
create or replace view v_student_units with (security_invoker = true) as
select
  qa.student_id,
  qa.unit_id,
  cu.unit_name,
  cu.curriculum_group,
  cu.curriculum_detail,
  count(*) as attempts,
  round(100.0 * count(*) filter (where qa.is_correct) / count(*), 1) as accuracy,
  count(*) filter (where not qa.is_correct) as wrong_count
from question_attempts qa
join curriculum_units cu on cu.id = qa.unit_id
group by qa.student_id, qa.unit_id, cu.unit_name, cu.curriculum_group, cu.curriculum_detail;

-- ---------------------------------------------------------------------
-- v_student_errors — 오답 유형 4분류 비율 (도넛용)
-- 지금은 error_category를 항상 안 매기고 있어(P0 결정) 당분간 빈 결과가 정상이다.
-- ---------------------------------------------------------------------
create or replace view v_student_errors with (security_invoker = true) as
select
  student_id,
  error_category,
  count(*) as cnt,
  round(100.0 * count(*) / sum(count(*)) over (partition by student_id), 1) as pct
from question_attempts
where is_correct = false and error_category is not null
group by student_id, error_category;

-- ---------------------------------------------------------------------
-- v_student_exams — 시험 회차별 점수 추이
-- ---------------------------------------------------------------------
create or replace view v_student_exams with (security_invoker = true) as
select
  ar.student_id,
  a.id as assessment_id,
  a.title,
  a.kind,
  a.exam_date,
  ar.raw_score,
  a.max_score,
  case when a.max_score > 0 then round(100.0 * ar.raw_score / a.max_score, 1) end as percentage,
  ar.grade_label
from assessment_results ar
join assessments a on a.id = ar.assessment_id;

-- ---------------------------------------------------------------------
-- v_student_weekly_trend — 최근 문제풀이 정답률의 주간 추이(8주 추이선용).
-- 지시서 §3.1 목록엔 없지만 "8주 추이선" 요구사항을 채우려면 필요해서 추가함.
-- ---------------------------------------------------------------------
create or replace view v_student_weekly_trend with (security_invoker = true) as
select
  student_id,
  date_trunc('week', created_at)::date as week_start,
  count(*) as attempts,
  round(100.0 * count(*) filter (where is_correct) / count(*), 1) as accuracy
from question_attempts
group by student_id, date_trunc('week', created_at);

-- ---------------------------------------------------------------------
-- v_monthly — 월별 현황. 신규가입/평균 출석·제출·정답률만 제공.
-- 주의: "퇴원/순증"은 뺐다 — profiles에 퇴원(withdrawn) 상태·날짜 개념 자체가 없어서
-- (students 테이블을 새로 안 만들고 profiles를 재사용하기로 한 결정의 여파) 계산할 데이터가 없음.
-- 나중에 퇴원 처리 개념이 생기면 그때 추가.
-- ---------------------------------------------------------------------
create or replace view v_monthly with (security_invoker = true) as
with months as (
  select date_trunc('month', p.created_at)::date as month
  from profiles p
  where p.role = 'student'
  group by 1
),
new_signups as (
  select date_trunc('month', created_at)::date as month, count(*) as new_students
  from profiles
  where role = 'student'
  group by 1
),
attendance_by_month as (
  select date_trunc('month', a.created_at)::date as month,
    round(100.0 * count(*) filter (where a.status in ('present','late')) / count(*), 1) as avg_attendance_rate
  from attendance a
  group by 1
),
submissions_by_month as (
  select date_trunc('month', ps.submitted_at)::date as month,
    count(*) filter (where ps.is_correct) as correct,
    count(*) filter (where ps.is_correct is not null) as gradable
  from problem_submissions ps
  where ps.submitted_at is not null
  group by 1
),
attempts_by_month as (
  select date_trunc('month', created_at)::date as month,
    round(100.0 * count(*) filter (where is_correct) / count(*), 1) as avg_accuracy
  from question_attempts
  group by 1
)
select
  m.month,
  coalesce(ns.new_students, 0) as new_students,
  ab.avg_attendance_rate,
  case when sb.gradable > 0 then round(100.0 * sb.correct / sb.gradable, 1) end as avg_submission_correct_rate,
  at.avg_accuracy
from months m
left join new_signups ns on ns.month = m.month
left join attendance_by_month ab on ab.month = m.month
left join submissions_by_month sb on sb.month = m.month
left join attempts_by_month at on at.month = m.month;

-- ---------------------------------------------------------------------
-- v_unit_weakness — 전 학생 단원 취약도 (콘텐츠 제작 우선순위)
-- ---------------------------------------------------------------------
create or replace view v_unit_weakness with (security_invoker = true) as
select
  qa.unit_id,
  cu.unit_name,
  cu.curriculum_group,
  cu.curriculum_detail,
  count(*) as attempts,
  round(100.0 * count(*) filter (where qa.is_correct) / count(*), 1) as accuracy,
  round(((100 - (100.0 * count(*) filter (where qa.is_correct) / count(*))) * ln(count(*) + 1))::numeric, 2) as weakness_score
from question_attempts qa
join curriculum_units cu on cu.id = qa.unit_id
group by qa.unit_id, cu.unit_name, cu.curriculum_group, cu.curriculum_detail
having count(*) >= 20;

-- ---------------------------------------------------------------------
-- v_risk_list — 리스크 55+ 학생 목록 (이름, 점수, 주원인)
-- ---------------------------------------------------------------------
create or replace view v_risk_list with (security_invoker = true) as
select
  student_id, name, email, attendance_rate, submission_rate, growth_delta, risk_score,
  case
    when attendance_rate is not null and attendance_rate < 85 then '출결 저조'
    when submission_rate is not null and submission_rate < 80 then '과제 미제출'
    when growth_delta is not null and growth_delta < 0 then '정답률 하락'
    else '최근 활동 없음'
  end as main_cause
from v_student_core
where risk_score >= 55;

grant select on
  v_student_core, v_student_units, v_student_errors, v_student_exams,
  v_student_weekly_trend, v_monthly, v_unit_weakness, v_risk_list
  to authenticated;

-- 실행 후 확인용
select 'v_student_core' as view_name, count(*) from v_student_core
union all select 'v_student_units', count(*) from v_student_units
union all select 'v_student_weekly_trend', count(*) from v_student_weekly_trend
union all select 'v_monthly', count(*) from v_monthly
union all select 'v_unit_weakness', count(*) from v_unit_weakness
union all select 'v_risk_list', count(*) from v_risk_list;
