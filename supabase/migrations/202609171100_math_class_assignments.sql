-- RUN_MATH_SITE.md 3단계 — 반 단위 문제지 배포.
-- 지시서 원문은 class_id/worksheet_id를 bigint로 가정했지만, 이 저장소는 classes.id/worksheets.id/
-- worksheet_assignments.id 전부 uuid다(확인 후 정정 — math-progression-project 때와 같은 패턴).
-- worksheet_assignments.due_at_override 컬럼은 없어서(확인함) 뷰에서 뺐다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table worksheet_assignments
  add column if not exists class_id uuid references classes(id) on delete cascade,
  alter column user_id drop not null;

alter table worksheet_assignments drop constraint if exists worksheet_assignments_target;
alter table worksheet_assignments add constraint worksheet_assignments_target
  check ((user_id is not null) <> (class_id is not null));

-- 반 배정은 (worksheet_id, class_id) 조합으로 중복 없이 — assignWorksheetToClass()의 upsert가 씀.
alter table worksheet_assignments drop constraint if exists worksheet_assignments_worksheet_class_key;
alter table worksheet_assignments add constraint worksheet_assignments_worksheet_class_key
  unique (worksheet_id, class_id);

-- 학생이 받은 문제지 = 개별 배정 + 반 배정. security_invoker 필수(이 저장소에서 실제 RLS 우회
-- 사고가 있었음 — feedback-view-security-invoker).
create or replace view v_math_student_assignments
  with (security_invoker = true) as
  select wa.worksheet_id, p.id as user_id, 'direct' as via
    from worksheet_assignments wa
    join profiles p on p.id = wa.user_id
  union all
  select wa.worksheet_id, p.id, 'class'
    from worksheet_assignments wa
    join profiles p on p.class_id = wa.class_id
    where wa.class_id is not null;

grant select on v_math_student_assignments to authenticated;

-- RLS: 기존 정책(user_id = auth.uid())은 그대로 두고, class_id 경로를 커버하는 정책을 추가한다.
drop policy if exists "students view own class assignments" on worksheet_assignments;
create policy "students view own class assignments" on worksheet_assignments
  for select using (
    class_id is not null
    and class_id = (select class_id from profiles where id = auth.uid())
  );

-- 반으로 배정된 문제지도 실제로 풀 수 있어야 하므로, worksheets/worksheet_problems/problems에도
-- class_id 경로 select 정책을 추가한다(기존 user_id 기반 정책은 그대로 둠, problembank.sql 수정 안 함).
drop policy if exists "students view class-assigned worksheets" on worksheets;
create policy "students view class-assigned worksheets" on worksheets
  for select using (
    exists (
      select 1 from worksheet_assignments wa
      join profiles p on p.class_id = wa.class_id
      where wa.worksheet_id = worksheets.id and p.id = auth.uid()
    )
  );

drop policy if exists "students view class-assigned worksheet_problems" on worksheet_problems;
create policy "students view class-assigned worksheet_problems" on worksheet_problems
  for select using (
    exists (
      select 1 from worksheet_assignments wa
      join profiles p on p.class_id = wa.class_id
      where wa.worksheet_id = worksheet_problems.worksheet_id and p.id = auth.uid()
    )
  );

drop policy if exists "students view class-assigned problems" on problems;
create policy "students view class-assigned problems" on problems
  for select using (
    exists (
      select 1
      from worksheet_problems wp
      join worksheet_assignments wa on wa.worksheet_id = wp.worksheet_id
      join profiles p on p.class_id = wa.class_id
      where wp.problem_id = problems.id and p.id = auth.uid()
    )
  );
