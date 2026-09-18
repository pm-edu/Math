-- RUN_MATH_SITE.md 5단계 — 학생 화면 3개 + 관리 화면 3개 + 통계 뷰 2개.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

-- ---------------------------------------------------------------------
-- 0. RLS 보강 — 4단계에서 빠뜨린 것을 5단계 준비 중 발견해 지금 고친다.
-- 3단계가 반 배포 경로에 대해 worksheets/worksheet_problems/problems select 정책을 추가한
-- 것과 똑같은 이유로, 과정(math_track_worksheets) 경로에도 같은 정책이 필요하다. 지금까지는
-- 4-5의 모든 함수가 service role로만 동작해서 안 걸렸지만, 5단계의 v_math_next_action을
-- 학생이 자기 브라우저(anon key)로 직접 읽으면(security_invoker=true라 RLS가 그대로 걸림)
-- 이 정책이 없어서 과정으로 열린 문제지가 조용히 안 보이는(항상 '완료'로 보이는) 문제가 있었다.
-- 정답/해설은 problems쪽만 있고, 그마저도 status<>'locked'(=열렸거나 통과한 것)로만 제한한다.
-- ---------------------------------------------------------------------
drop policy if exists "students view open track worksheets" on worksheets;
create policy "students view open track worksheets" on worksheets
  for select using (
    exists (
      select 1 from math_track_progress mtp
      where mtp.worksheet_id = worksheets.id and mtp.user_id = auth.uid() and mtp.status <> 'locked'
    )
  );

drop policy if exists "students view open track worksheet_problems" on worksheet_problems;
create policy "students view open track worksheet_problems" on worksheet_problems
  for select using (
    exists (
      select 1 from math_track_progress mtp
      where mtp.worksheet_id = worksheet_problems.worksheet_id and mtp.user_id = auth.uid() and mtp.status <> 'locked'
    )
  );

drop policy if exists "students view open track problems" on problems;
create policy "students view open track problems" on problems
  for select using (
    exists (
      select 1
      from worksheet_problems wp
      join math_track_progress mtp on mtp.worksheet_id = wp.worksheet_id
      where wp.problem_id = problems.id and mtp.user_id = auth.uid() and mtp.status <> 'locked'
    )
  );

-- ---------------------------------------------------------------------
-- 5-2. 통계 뷰 2개
-- 둘 다 문항당 "최신 시도"만 센다 — retryWrong으로 같은 문항을 여러 번 풀면 오래된 오답 시도까지
-- 같이 세어 정답률이 실제보다 낮게 나오는 걸 막는다(worksheet.ts의 loadLatestAttempts와 같은 원칙).
-- ---------------------------------------------------------------------
drop view if exists v_math_student_overview;
create view v_math_student_overview
  with (security_invoker = true) as
with latest as (
  select *, row_number() over (
    partition by student_id, worksheet_id, problem_id order by created_at desc
  ) as rn
  from question_attempts
  where worksheet_id is not null
),
agg as (
  select student_id, worksheet_id,
    count(*) as problem_count,
    sum(case when is_correct then 1 else 0 end) as correct_count,
    max(created_at) as last_attempt_at
  from latest where rn = 1
  group by student_id, worksheet_id
)
select
  agg.student_id as user_id,
  agg.worksheet_id,
  w.title as worksheet_title,
  agg.problem_count,
  agg.correct_count,
  round(agg.correct_count::numeric / agg.problem_count, 3) as accuracy,
  agg.last_attempt_at
from agg
join worksheets w on w.id = agg.worksheet_id;

grant select on v_math_student_overview to authenticated;

drop view if exists v_math_worksheet_overview;
create view v_math_worksheet_overview
  with (security_invoker = true) as
with latest as (
  select *, row_number() over (
    partition by student_id, worksheet_id, problem_id order by created_at desc
  ) as rn
  from question_attempts
  where worksheet_id is not null
),
agg as (
  select student_id, worksheet_id,
    count(*) as problem_count,
    sum(case when is_correct then 1 else 0 end) as correct_count
  from latest where rn = 1
  group by student_id, worksheet_id
)
select
  w.id as worksheet_id,
  w.title as worksheet_title,
  count(distinct agg.student_id) as students_attempted,
  count(distinct agg.student_id) filter (
    where agg.problem_count > 0 and agg.correct_count::numeric / agg.problem_count >= 0.8
  ) as students_passed,
  round(avg(agg.correct_count::numeric / nullif(agg.problem_count, 0)), 3) as avg_accuracy
from worksheets w
left join agg on agg.worksheet_id = w.id
where w.subject = 'math'
group by w.id, w.title;

grant select on v_math_worksheet_overview to authenticated;
