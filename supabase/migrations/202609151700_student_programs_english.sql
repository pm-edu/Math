-- 목적: student_programs.program에 'english'(단어 완전학습 /english/*)를 추가한다.
-- 지금까지 이 컬럼은 'math'/'sat'/'toefl' 셋뿐이라, 일반 영어 단어 학습에 대응하는 값이
-- 아예 없었다(2026-09-15 점검 — 마이페이지 "영어 학습" 링크가 이 체크를 우회하는 원인 중
-- 하나). 기존 마이그레이션 파일은 그대로 두고 체크 제약만 넓힌다.
--
-- 되돌리는 법:
--   alter table student_programs drop constraint if exists student_programs_program_check;
--   alter table student_programs add constraint student_programs_program_check
--     check (program in ('math', 'sat', 'toefl'));
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.

alter table student_programs drop constraint if exists student_programs_program_check;
alter table student_programs add constraint student_programs_program_check
  check (program in ('math', 'sat', 'toefl', 'english'));
