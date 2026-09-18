-- RUN_MATH_SITE.md 6단계 A(옵션 1) — 학부모 리포트의 "수학 진행 섹션"을 옛 설계
-- (v_math_unit_progress/v_math_weakness/math_sessions)에서 떼어내 새 뷰 하나로 교체하기 위한
-- 사전 작업. 이 뷰가 자리잡고 리포트 화면이 정상 동작하는 걸 확인한 뒤에야 옛 테이블들을 지운다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

create or replace view v_math_parent_progress
  with (security_invoker = true) as
with weeks as (
  select generate_series(0, 3) as week_idx
),
weekly_raw as (
  -- 첫 시도(attempt_no=1)만, 반 수업 중 채점(source='lesson')은 제외 — 지시서 명시.
  select qa.student_id as user_id,
    floor(extract(epoch from (now() - qa.created_at)) / (7 * 86400))::int as week_idx,
    qa.is_correct
  from question_attempts qa
  where qa.attempt_no = 1
    and qa.source <> 'lesson'
    and qa.created_at >= now() - interval '28 days'
),
users_with_data as (
  select distinct user_id from weekly_raw
),
weekly as (
  select user_id, week_idx,
    round(avg(case when is_correct then 1.0 else 0.0 end), 3) as accuracy,
    count(*) as attempts
  from weekly_raw
  where week_idx between 0 and 3
  group by user_id, week_idx
),
weekly_full as (
  -- 4주 전부 채운다(시도 없는 주는 accuracy null) — 화면이 항상 칸 4개를 그릴 수 있게.
  select u.user_id, w.week_idx, wk.accuracy, coalesce(wk.attempts, 0) as attempts
  from users_with_data u
  cross join weeks w
  left join weekly wk on wk.user_id = u.user_id and wk.week_idx = w.week_idx
),
weekly_agg as (
  select user_id,
    jsonb_agg(jsonb_build_object('week_idx', week_idx, 'accuracy', accuracy, 'attempts', attempts) order by week_idx desc) as weekly_accuracy
  from weekly_full
  group by user_id
),
track_totals as (
  select p.id as user_id, mt.name as track_name,
    (select count(*) from math_track_worksheets mtw where mtw.track_id = p.track_id) as total_count
  from profiles p
  left join math_tracks mt on mt.id = p.track_id
),
progress_counts as (
  select user_id, count(*) filter (where status = 'passed') as passed_count
  from math_track_progress
  group by user_id
),
worksheet_best as (
  select user_id, worksheet_id, best_accuracy,
    row_number() over (partition by user_id order by best_accuracy asc nulls last) as rn
  from math_track_progress
  where best_accuracy is not null
),
weakest_agg as (
  select wb.user_id,
    jsonb_agg(jsonb_build_object(
      'worksheet_id', wb.worksheet_id,
      'title', w.title,
      'unit_name', cu.unit_name,
      'best_accuracy', wb.best_accuracy
    ) order by wb.rn) as weakest_worksheets
  from worksheet_best wb
  join worksheets w on w.id = wb.worksheet_id
  left join curriculum_units cu on cu.id = w.unit_id
  where wb.rn <= 3
  group by wb.user_id
)
select
  tt.user_id,
  tt.track_name,
  coalesce(pc.passed_count, 0) as passed_count,
  coalesce(tt.total_count, 0) as total_count,
  coalesce(wa.weekly_accuracy, '[]'::jsonb) as weekly_accuracy,
  coalesce(wk.weakest_worksheets, '[]'::jsonb) as weakest_worksheets
from track_totals tt
left join progress_counts pc on pc.user_id = tt.user_id
left join weekly_agg wa on wa.user_id = tt.user_id
left join weakest_agg wk on wk.user_id = tt.user_id;

grant select on v_math_parent_progress to authenticated;
