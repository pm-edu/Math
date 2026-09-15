-- 목적: RUN_SIGNUP.md S4 전제조건 — student_programs.status 체크 제약이 원래
-- ('active','paused','ended')만 허용해서, 온보딩에서 넣으려는 status='interested'가
-- 그대로는 막힌다(제약 위반). RLS·기존 정책은 그대로 둔다 — S4 지시대로 학생 삽입은
-- 서버 라우트(src/app/api/study/programs/route.ts, service_role)로만 하고,
-- student_programs에 새 RLS 정책을 추가하지 않는다.
--
-- 되돌리는 법:
--   alter table student_programs drop constraint if exists student_programs_status_check;
--   alter table student_programs add constraint student_programs_status_check
--     check (status in ('active', 'paused', 'ended'));
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table student_programs drop constraint if exists student_programs_status_check;
alter table student_programs add constraint student_programs_status_check
  check (status in ('interested', 'active', 'paused', 'ended'));
