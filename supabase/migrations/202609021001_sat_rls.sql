-- SAT P0: RLS 정책 (TOEFL 패턴 그대로 재사용 — supabase/migrations/202608151201_toefl_rls_and_storage.sql 참고)
-- is_staff()는 supabase/roles-tier.sql에 이미 정의돼 있음(재사용, 새로 안 만듦).
-- 핵심 방어선: verified=false 문항/지문은 학생 역할로 어떤 경로로도 조회되지 않는다.
--   기본 테이블(sat_stimuli/sat_questions)은 staff만 직접 접근하고, 학생은
--   sat_stimuli_public/sat_questions_public 뷰(정의자 권한 실행, WHERE verified=true)로만 읽는다.
-- 되돌리려면: 아래 정책들을 drop policy로 제거하는 새 마이그레이션을 추가할 것(이 파일은 수정하지 않음).
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요.

alter table sat_forms enable row level security;
alter table sat_form_modules enable row level security;
alter table sat_stimuli enable row level security;
alter table sat_questions enable row level security;
alter table sat_attempts enable row level security;
alter table sat_responses enable row level security;

-- ============ 폼: 학생은 공개된(is_published) 것만, 직원은 전부 ============
create policy "read published or staff sat forms" on sat_forms
  for select to authenticated using (is_published = true or is_staff());
create policy "staff manage sat forms" on sat_forms
  for all to authenticated using (is_staff()) with check (is_staff());

-- ============ 모듈: 직원만 (학생은 아직 폼/모듈을 직접 조회할 경로가 없음 — 조립은 이후 단계) ============
create policy "staff manage sat form modules" on sat_form_modules
  for all to authenticated using (is_staff()) with check (is_staff());

-- ============ 지문/문항(정답 포함): 직원만 직접 접근. 학생은 public 뷰로만 읽는다 ============
create policy "staff manage sat stimuli" on sat_stimuli
  for all to authenticated using (is_staff()) with check (is_staff());
create policy "staff manage sat questions" on sat_questions
  for all to authenticated using (is_staff()) with check (is_staff());

-- 뷰는 테이블이 아니라 GRANT로 접근을 연다(RLS와 별개 메커니즘).
grant select on sat_stimuli_public to authenticated;
grant select on sat_questions_public to authenticated;

-- ============ 응시 기록: 본인 것만, 직원은 전체 조회(모니터링·검수용) ============
create policy "own sat attempts" on sat_attempts
  for all to authenticated using (user_id = auth.uid() or is_staff())
  with check (user_id = auth.uid());

-- sat_responses는 user_id 컬럼이 없다(PK가 attempt_id+question_id) — 소유권은 sat_attempts를 통해 확인.
-- 다른 학생의 응답은 attempt_id가 다르므로 이 EXISTS 자체가 걸러낸다.
create policy "own sat responses" on sat_responses
  for all to authenticated using (
    exists (
      select 1 from sat_attempts a
      where a.id = sat_responses.attempt_id
        and (a.user_id = auth.uid() or is_staff())
    )
  )
  with check (
    exists (
      select 1 from sat_attempts a
      where a.id = sat_responses.attempt_id
        and a.user_id = auth.uid()
    )
  );
